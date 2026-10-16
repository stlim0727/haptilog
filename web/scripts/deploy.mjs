import { spawnSync } from "node:child_process";
import { checkBackend, publicConfig } from "./backend-readiness.mjs";
const config = publicConfig();
const checks = await checkBackend(config);
for (const check of checks)
  console.log(
    `${check.ready ? "READY" : "BLOCKED"}: ${check.name}${check.ready ? "" : `. ${check.remedy}`}`,
  );
if (checks.some((check) => !check.ready)) process.exit(1);
const env = {
  ...process.env,
  VITE_SUPABASE_URL: config.url,
  VITE_SUPABASE_PUBLISHABLE_KEY: config.key,
};
for (const args of [
  ["node_modules/vite/bin/vite.js", "build"],
  [
    "node_modules/wrangler/bin/wrangler.js",
    "deploy",
    ...(process.argv.includes("--production") ? ["--env", "production"] : []),
  ],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
