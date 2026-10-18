import type { SupabaseClient } from "@supabase/supabase-js";

// Always claim fresh server rows. Neither UI state nor an empty Storage response
// proves absence; only the server finalizer can authorize removing metadata.
export async function purgeRecordings(client: SupabaseClient, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const { data: claimed, error: claimError } = await client
    .from("recordings")
    .update({ purging_at: new Date().toISOString() })
    .in("id", ids)
    .not("deleted_at", "is", null)
    .select("id,audio_path");
  if (claimError) throw claimError;
  if (!Array.isArray(claimed) || !claimed.length) return [];

  const paths = claimed.map((r) => r.audio_path).filter((p): p is string => typeof p === "string" && p.length > 0);
  if (paths.length) {
    const { error } = await client.storage.from("recordings").remove(paths);
    if (error) throw error;
  }
  // Safe on both first attempts and retries after a page/process restart.
  // The RPC checks ownership, claim, and actual Storage metadata independently.
  const { data, error } = await client.rpc("finalize_recording_purges", {
    p_ids: claimed.map((r) => r.id),
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("Purge completion was not verified");
  return data.map((r: { id: string }) => r.id);
}
