/* eslint-disable import/no-unresolved -- Deno resolves jsr/npm specifiers at deployment. */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { burnCors, burnResponse, prepareBurn, processBurnJob } from '../_shared/contentBurn.ts';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: burnCors });
  if (req.method !== 'POST') return burnResponse({ error: 'Method not allowed' }, 405);
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return burnResponse({ error: 'Unauthorized' }, 401);
    const caller = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await caller.auth.getUser();
    if (authError || !user) return burnResponse({ error: 'Unauthorized' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const body = await req.json();
    let jobId: string;
    if (body.job_id) {
      if (typeof body.job_id !== 'string' || !uuid.test(body.job_id)) return burnResponse({ error: 'Invalid job' }, 400);
      const { data: job, error } = await admin.from('content_burn_jobs').select('id,actor_id,couple_id,state').eq('id',body.job_id).maybeSingle();
      if (error) throw error;
      // Receipt access belongs to the verified initiator, including after disconnect.
      if (!job || job.actor_id !== user.id) return burnResponse({ error: 'Forbidden' }, 403);
      if (job.state === 'complete') return burnResponse({ job_id: job.id, state: 'complete' });
      jobId = job.id;
    } else {
      if (!uuid.test(body.couple_id ?? '') || !['chat','vault','wish','categories'].includes(body.kind)
        || (body.ids !== undefined && (!Array.isArray(body.ids) || body.ids.length > 500 || body.ids.some((id: unknown) => typeof id !== 'string' || !uuid.test(id))))
        || (body.categories !== undefined && (!Array.isArray(body.categories) || body.categories.some((c: unknown) => !['all','chat','vault','wish','dice','dare','activity','points'].includes(c as string))))) {
        return burnResponse({ error: 'Invalid selection' }, 400);
      }
      jobId = await prepareBurn(admin, body.couple_id, user.id, body.kind, body.ids ?? [], body.categories ?? []);
    }
    try {
      const complete = await processBurnJob(admin,jobId);
      return burnResponse({ job_id: jobId, state: complete ? 'complete' : 'pending' }, complete ? 200 : 202);
    } catch {
      // The manifest is already committed. Return a resumable receipt, never
      // a false success or a raw error containing private Storage paths.
      return burnResponse({ job_id: jobId, state: 'pending' }, 202);
    }
  } catch (error: any) {
    const forbidden = error?.code === '42501';
    return burnResponse({ error: forbidden ? 'Forbidden' : 'Could not start deletion' }, forbidden ? 403 : 400);
  }
});
