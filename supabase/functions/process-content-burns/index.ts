/* eslint-disable import/no-unresolved -- Deno resolves jsr/npm specifiers at deployment. */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { processBurnJob, processAccountBurn } from '../_shared/contentBurn.ts';
Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(null,{status:405});
  const admin = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: valid, error: tokenError } = await admin.rpc('validate_burn_worker_token',{p_token:req.headers.get('x-burn-worker-token')});
  if (tokenError || valid !== true) return new Response(null,{status:401});
  const { error: dueError } = await admin.rpc('enqueue_due_content_burns');
  if (dueError) return new Response(null,{status:500});
  const { data: jobs, error } = await admin.from('content_burn_jobs').select('id,attempts')
    .eq('state','pending').lte('next_attempt_at',new Date().toISOString()).order('created_at').limit(20);
  if (error) return new Response(null,{status:500});
  const deadline = Date.now()+40_000;
  let complete=0;
  for (const job of jobs ?? []) {
    if (Date.now()>deadline) break;
    try { if (await processBurnJob(admin,job.id)) { complete++; continue; } } catch { /* retain inventory */ }
    const attempts=job.attempts+1;
    await admin.from('content_burn_jobs').update({ attempts,
      next_attempt_at:new Date(Date.now()+Math.min(60*60_000,60_000*2**Math.min(attempts,6))).toISOString(),
    }).eq('id',job.id).eq('state','pending');
  }
  const { data: accounts } = await admin.from('account_burn_requests').select('user_id').order('created_at').limit(10);
  for (const account of accounts ?? []) {
    if (Date.now()>deadline) break;
    try { await processAccountBurn(admin,account.user_id); } catch { /* retry next scheduled run */ }
  }
  return new Response(JSON.stringify({complete}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
});
