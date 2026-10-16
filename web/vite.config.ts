import { defineConfig, loadEnv } from "vite";

// Reject privileged credentials before Vite can embed any VITE_ setting in assets.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key) {
    let isPublic = key.startsWith("sb_publishable_");
    if (key.split(".").length === 3) {
      try {
        isPublic =
          JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
            .role === "anon";
      } catch {
        isPublic = false;
      }
    }
    if (!isPublic)
      throw new Error(
        "VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable or legacy anon key. Privileged credentials are forbidden.",
      );
  }
  return {};
});
