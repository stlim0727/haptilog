import { defineConfig, loadEnv } from "vite";
import { execFileSync } from "node:child_process";
import { assertPublicKey } from "./scripts/public-key.mjs";

// Reject privileged credentials before Vite can embed any VITE_ setting in assets.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key) assertPublicKey(key);
  const git = (...args: string[]) => {
    try {
      return execFileSync("git", args, { encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  };
  return {
    define: {
      __BUILD_INFO__: JSON.stringify({
        branch: process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || git("branch", "--show-current") || "detached",
        commit: git("rev-parse", "HEAD"),
        committedAt: git("show", "-s", "--format=%cI", "HEAD"),
      }),
    },
  };
});
