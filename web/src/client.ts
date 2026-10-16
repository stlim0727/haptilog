import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (key?.startsWith("sb_secret_"))
  throw new Error("Only a publishable key can be used in the portal");
if (key?.split(".").length === 3) {
  try {
    if (
      JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")))
        .role === "service_role"
    )
      throw new Error("Privileged keys are forbidden");
  } catch (e) {
    if (e instanceof Error && e.message === "Privileged keys are forbidden")
      throw e;
  }
}
export const supabase =
  url && key
    ? createClient(url, key, {
        auth: {
          storageKey: "haptilog-portal-session",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
