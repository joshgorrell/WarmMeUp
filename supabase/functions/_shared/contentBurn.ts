// The database transaction owns authorization, linked-record discovery and
// hard deletion. Storage API deletion is deliberately retryable outside it.
export async function processBurnJob(admin: any, jobId: string): Promise<boolean> {
  const { data: objects, error } = await admin.from('content_burn_objects')
    .select('bucket,path').eq('job_id', jobId).limit(500);
  if (error) throw error;
  const grouped: Record<string, string[]> = {};
  for (const object of objects ?? []) (grouped[object.bucket] ??= []).push(object.path);
  for (const [bucket, paths] of Object.entries(grouped)) {
    const { error: removeError } = await admin.storage.from(bucket).remove(paths);
    if (removeError) throw removeError;
    // Do not discard inventory on API failure. Successful batches can retry
    // safely after a crash between removal and this database operation.
    const { error: inventoryError } = await admin.rpc('acknowledge_content_burn_objects', { p_job: jobId, p_bucket: bucket, p_paths: paths });
    if (inventoryError) throw inventoryError;
  }
  // finish checks the remaining manifest against Storage metadata. A job with
  // more than one batch must retain its unprocessed inventory.
  const { count, error: countError } = await admin.from('content_burn_objects')
    .select('*', { count: 'exact', head: true }).eq('job_id', jobId);
  if (countError) throw countError;
  if (count) return false;
  const { data: complete, error: finishError } = await admin.rpc('finish_content_burn', { p_job: jobId });
  if (finishError) throw finishError;
  return complete === true;
}

export async function prepareBurn(admin: any, coupleId: string, actorId: string,
  kind: string, ids: string[] = [], categories: string[] = []): Promise<string> {
  const { data, error } = await admin.rpc('prepare_content_burn', {
    p_couple: coupleId, p_actor: actorId, p_kind: kind, p_ids: ids, p_categories: categories,
  });
  if (error) throw error;
  return data;
}

export const burnCors = {
  'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};
export const burnResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...burnCors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

export async function processAccountBurn(admin: any, userId: string): Promise<boolean> {
  const { data: request, error } = await admin.from('account_burn_requests')
    .select('job_ids').eq('user_id',userId).maybeSingle();
  if (error) throw error;
  if (!request) return false;
  for (const id of request.job_ids) {
    const { data: job, error: jobError } = await admin.from('content_burn_jobs').select('state').eq('id',id).single();
    if (jobError) throw jobError;
    if (job.state !== 'complete' && !await processBurnJob(admin,id)) return false;
  }
  // Keep auth and its FK-discoverable content until physical cleanup finishes.
  // Check every explicit cleanup; an error leaves a durable request for retry.
  for (const [table,column] of [
    ['permanent_review_access','user_id'], ['subscription_events','user_id'],
    ['tell_me_prompts','created_by_user_id'], ['dare_prompts','created_by_user_id'],
    ['dice_prompts','created_by_user_id'], ['user_diagnostics','user_id'], ['user_settings','user_id'],
  ]) {
    const { error: rowError } = await admin.from(table).delete().eq(column,userId);
    if (rowError) throw rowError;
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError && deleteError.status !== 404) throw deleteError;
  const { error: requestError } = await admin.from('account_burn_requests').delete().eq('user_id',userId);
  if (requestError) throw requestError;
  return true;
}
