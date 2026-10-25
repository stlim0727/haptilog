import { supabase } from "./client";

export type AccountWatch = { owner_user_id: string; watch_id: string };
export async function watchAccount(operation: "list" | "save" | "restore" | "unlink", owner?: string) {
  if (!supabase) throw new Error("Portal not configured");
  const { data, error } = await supabase.functions.invoke("watch-access", {
    body: { action: "account", operation, ...(owner ? { owner_user_id: owner } : {}) },
  });
  if (error) throw error;
  return (data?.watches ?? []) as AccountWatch[];
}

export async function signInGoogle() {
  if (!supabase) throw new Error("Portal not configured");
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const options = { redirectTo: `${window.location.origin}/`, queryParams: { prompt: "select_account" } };
  // Upgrade a paired anonymous browser so its existing grant remains available
  // after OAuth. For an already registered Google identity, sign in then re-pair.
  const { error } = session?.user.is_anonymous
    ? await supabase.auth.linkIdentity({ provider: "google", options })
    : await supabase.auth.signInWithOAuth({ provider: "google", options });
  if (error) throw error;
}
