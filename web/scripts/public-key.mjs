const message =
  "VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key. Privileged credentials are forbidden.";

// Shared by network probes and Vite: validation must precede all outbound requests.
export function assertPublicKey(key) {
  if (typeof key !== "string" || key.startsWith("sb_secret_"))
    throw new Error(message);
  let allowed = /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!allowed && key.split(".").length === 3) {
    try {
      allowed =
        JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
          .role === "anon";
    } catch {
      allowed = false;
    }
  }
  if (!allowed) throw new Error(message);
}
