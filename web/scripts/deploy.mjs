import { spawnSync } from "node:child_process";
import { splitDeploymentEnv, deploymentCommands } from "./deployment-env.mjs";

// Remove credentials before loading Vite or running any readiness/build code.
const { publicEnv, cloudflareEnv } = splitDeploymentEnv(process.env);
for (const name of Object.keys(cloudflareEnv)) delete process.env[name];
const { checkBackend, publicConfig } = await import("./backend-readiness.mjs");
const config = publicConfig();
const checks = await checkBackend(config);
for (const check of checks)
  console.log(
    `${check.ready ? "READY" : "BLOCKED"}: ${check.name}${check.ready ? "" : `. ${check.remedy}`}`,
  );
if (checks.some((check) => !check.ready)) process.exit(1);
const isProduction = process.argv.includes("--production");
const buildEnv = {
  ...publicEnv,
  VITE_SUPABASE_URL: config.url,
  VITE_SUPABASE_PUBLISHABLE_KEY: config.key,
  ...(isProduction ? { VITE_DISABLE_TEST_LOGIN: "true" } : {}),
};
for (const { args, env } of deploymentCommands(
  process.argv.includes("--production"),
  buildEnv,
  cloudflareEnv,
  !process.argv.includes("--build-only"),
)) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
