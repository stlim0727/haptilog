import { readFileSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { assertPublicKey } from "./public-key.mjs";
export function publicConfig(env = process.env) {
  const fileEnv = loadEnv(
    "production",
    fileURLToPath(new URL("../", import.meta.url)),
    "VITE_",
  );
  const defaults = Object.fromEntries(
    readFileSync(
      new URL("../../watch/cloud.properties", import.meta.url),
      "utf8",
    )
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1).trim()];
      }),
  );
  return {
    url:
      env.VITE_SUPABASE_URL ||
      fileEnv.VITE_SUPABASE_URL ||
      defaults.HAPTILOG_SUPABASE_URL,
    key:
      env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      fileEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
      defaults.HAPTILOG_SUPABASE_PUBLISHABLE_KEY,
  };
}
export async function checkBackend(config = publicConfig(), fetcher = fetch) {
  assertPublicKey(config.key);
  const request = async (path) => {
    try {
      const r = await fetcher(config.url + path, {
        headers: { apikey: config.key },
        signal: AbortSignal.timeout(15000),
      });
      return { status: r.status, data: await r.json() };
    } catch {
      return { status: 0, data: null };
    }
  };
  const [auth, pairing, analysis] = await Promise.all([
    request("/auth/v1/settings"),
    request("/functions/v1/watch-access?health"),
    request("/functions/v1/voice-enrich?health"),
  ]);
  return [
    {
      name: "Anonymous sign-ins",
      ready:
        auth.status === 200 &&
        auth.data?.external?.anonymous_users === true &&
        auth.data?.disable_signup !== true,
      remedy:
        "Enable Anonymous Sign-Ins in the HaptiLog Auth provider settings.",
    },
    {
      name: "Watch pairing",
      ready: pairing.status === 200 && pairing.data?.ready === true,
      remedy: "Deploy watch-access with its server-side runtime configuration.",
    },
    {
      name: "AI enrichment",
      ready: analysis.status === 200 && analysis.data?.ready === true,
      remedy:
        "Configure GEMINI_API_KEY and GEMINI_MODEL in Supabase Edge Function secrets.",
    },
  ];
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const results = await checkBackend();
  for (const r of results)
    console.log(
      `${r.ready ? "READY" : "BLOCKED"}: ${r.name}${r.ready ? "" : `. ${r.remedy}`}`,
    );
  if (results.some((r) => !r.ready)) process.exitCode = 1;
}
