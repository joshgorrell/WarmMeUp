import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const RETENTION_CHECKPOINTS = [7, 30, 60, 90, 180, 365];

interface CoupleActivation {
  couple_id: string;
  activated_at: string;
}

interface CohortRow {
  cohortMonth: string;
  cohortSize: number;
  retention: { [key: string]: { retained: number; rate: number } };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: profile } = await adminClient
      .from("profiles")
      .select("is_admin, is_super_admin")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.is_admin && !profile?.is_super_admin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get all paired couples with their activation date
    const { data: couples } = await adminClient
      .from("couples")
      .select("id, user_a_id, user_b_id, created_at")
      .not("user_b_id", "is", null);

    if (!couples || couples.length === 0) {
      return new Response(
        JSON.stringify({
          cohorts: [],
          definitions: {
            activatedCouple: "A couple where both partners are paired (user_b_id IS NOT NULL) and the couple has at least one activity event or chat message",
            activeCouple: "A paired couple with at least one activity event or chat message in the last 7 days",
          },
          _ts: new Date().toISOString(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. For each couple, find activation date = earliest of couple created_at or first activity/chat
    const coupleIds = couples.map((c) => c.id);
    const { data: activityData } = await adminClient
      .from("activity_events")
      .select("couple_id, created_at")
      .in("couple_id", coupleIds)
      .order("created_at", { ascending: true });

    const { data: chatData } = await adminClient
      .from("chat_messages")
      .select("couple_id, created_at")
      .is("deleted_at", null)
      .in("couple_id", coupleIds)
      .order("created_at", { ascending: true });

    // Build earliest activity per couple
    const earliestActivity = new Map<string, string>();
    for (const evt of activityData || []) {
      if (evt.couple_id) {
        const existing = earliestActivity.get(evt.couple_id);
        if (!existing || evt.created_at < existing) {
          earliestActivity.set(evt.couple_id, evt.created_at);
        }
      }
    }
    for (const msg of chatData || []) {
      if (msg.couple_id) {
        const existing = earliestActivity.get(msg.couple_id);
        if (!existing || msg.created_at < existing) {
          earliestActivity.set(msg.couple_id, msg.created_at);
        }
      }
    }

    // Determine activation date per couple
    const activations: CoupleActivation[] = [];
    for (const couple of couples) {
      const coupleCreated = couple.created_at;
      const firstActivity = earliestActivity.get(couple.id);
      // Activation = earliest of couple creation (when paired) or first activity
      const activatedAt = firstActivity
        ? (firstActivity < coupleCreated ? firstActivity : coupleCreated)
        : coupleCreated;
      activations.push({ couple_id: couple.id, activated_at: activatedAt });
    }

    // 3. Build all activity timestamps per couple for retention checks
    const allActivityByCouple = new Map<string, number[]>();
    for (const evt of activityData || []) {
      if (!evt.couple_id) continue;
      if (!allActivityByCouple.has(evt.couple_id)) allActivityByCouple.set(evt.couple_id, []);
      allActivityByCouple.get(evt.couple_id)!.push(new Date(evt.created_at).getTime());
    }
    for (const msg of chatData || []) {
      if (!msg.couple_id) continue;
      if (!allActivityByCouple.has(msg.couple_id)) allActivityByCouple.set(msg.couple_id, []);
      allActivityByCouple.get(msg.couple_id)!.push(new Date(msg.created_at).getTime());
    }

    // Sort each couple's activity timestamps
    for (const [id, timestamps] of allActivityByCouple) {
      timestamps.sort((a, b) => a - b);
    }

    // 4. Group couples by activation month
    const cohortMap = new Map<string, CoupleActivation[]>();
    for (const act of activations) {
      const monthKey = act.activated_at.slice(0, 7); // YYYY-MM
      if (!cohortMap.has(monthKey)) cohortMap.set(monthKey, []);
      cohortMap.get(monthKey)!.push(act);
    }

    // 5. For each cohort, compute retention at each checkpoint
    const cohorts: CohortRow[] = [];
    const nowMs = Date.now();

    for (const [month, couplesInCohort] of cohortMap) {
      const cohortSize = couplesInCohort.length;
      const retention: { [key: string]: { retained: number; rate: number } } = {};

      for (const days of RETENTION_CHECKPOINTS) {
        const key = `D${days}`;
        let retained = 0;

        for (const couple of couplesInCohort) {
          const activatedMs = new Date(couple.activated_at).getTime();
          const checkpointMs = activatedMs + days * 86400000;

          // Only count if the checkpoint has passed
          if (checkpointMs <= nowMs) {
            const timestamps = allActivityByCouple.get(couple.couple_id) || [];
            // Check if there's any activity in the 7-day window around the checkpoint
            const windowStart = checkpointMs - 3 * 86400000;
            const windowEnd = checkpointMs + 4 * 86400000;
            const hasActivity = timestamps.some((ts) => ts >= windowStart && ts <= windowEnd);
            if (hasActivity) retained++;
          }
        }

        // Rate = retained / cohortSize (only count couples whose checkpoint has passed)
        const eligibleCouples = couplesInCohort.filter((c) => {
          const activatedMs = new Date(c.activated_at).getTime();
          return activatedMs + days * 86400000 <= nowMs;
        }).length;

        retention[key] = {
          retained,
          rate: eligibleCouples > 0 ? Math.round((retained / eligibleCouples) * 1000) / 10 : 0,
        };
      }

      cohorts.push({ cohortMonth: month, cohortSize, retention });
    }

    // Sort cohorts by month
    cohorts.sort((a, b) => a.cohortMonth.localeCompare(b.cohortMonth));

    return new Response(
      JSON.stringify({
        cohorts,
        checkpoints: RETENTION_CHECKPOINTS.map((d) => `D${d}`),
        definitions: {
          activatedCouple: "A couple where both partners are paired (user_b_id IS NOT NULL) and the couple has at least one activity event or chat message",
          activeCouple: "A paired couple with at least one activity event or chat message in the last 7 days",
          retentionWindow: "A couple is considered retained at day N if they have any activity in a 7-day window centered on day N after activation",
        },
        _ts: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error", detail: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
