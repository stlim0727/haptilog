import { defineConfig, loadEnv } from "vite";
import { assertPublicKey } from "./scripts/public-key.mjs";

// Reject privileged credentials before Vite can embed any VITE_ setting in assets.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key) assertPublicKey(key);
  return {};
});
