import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

type Dependencies = {
  env: (name: string) => string | undefined;
  createClient: (
    url: string,
    key: string,
    options: { auth: { persistSession: boolean } },
  ) => SupabaseClient;
};
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers });
export async function codeHash(
  secret: string,
  ownerOrWatch: string,
  code: string,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${ownerOrWatch}:${code}`),
  );
  return Array.from(new Uint8Array(signature), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function derivedPairingSecret(root: string) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(root),
    "HKDF",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new TextEncoder().encode("haptilog-pairing"),
      info: new TextEncoder().encode("watch-access-v1"),
    },
    material,
    256,
  );
  return Array.from(new Uint8Array(bits), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function createAccessHandler(deps: Dependencies) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers });
    if (req.method === "GET" && new URL(req.url).searchParams.has("health")) {
      const override = deps.env("WATCH_PAIRING_SECRET");
      const ready = Boolean(
        deps.env("SUPABASE_URL") &&
        deps.env("SUPABASE_SERVICE_ROLE_KEY") &&
        (override === undefined || override.length >= 32),
      );
      return reply(ready ? 200 : 503, { ready });
    }
    if (req.method !== "POST") return reply(405, { error: "POST required" });
    const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return reply(401, { error: "Authentication required" });
    try {
      const url = deps.env("SUPABASE_URL"),
        serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !serviceKey)
        return reply(503, { error: "Web access is not configured" });
      // Use a separate key derived from the runtime's server-only credential.
      // An explicit pairing secret can be provided for independent rotation.
      const secret =
        deps.env("WATCH_PAIRING_SECRET") ??
        (await derivedPairingSecret(serviceKey));
      if (secret.length < 32)
        return reply(503, { error: "Web access is not configured" });
      const admin = deps.createClient(url, serviceKey, {
        auth: { persistSession: false },
      });
      // Verify signature, expiry and user server-side before reading session claims.
      const {
        data: { user },
        error,
      } = await admin.auth.getUser(token);
      if (error || !user)
        return reply(401, { error: "Invalid authentication" });
      const claims = JSON.parse(
        atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (
        !/^[0-9a-f-]{36}$/i.test(claims.session_id ?? "") ||
        claims.sub !== user.id
      )
        return reply(401, { error: "Session required" });
      const reader = req.body?.getReader();
      if (!reader) return reply(400, { error: "Request required" });
      let text = "",
        size = 0;
      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024) {
          await reader.cancel();
          return reply(413, { error: "Request too large" });
        }
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        return reply(400, { error: "Invalid request" });
      }
      if (!body || typeof body !== "object")
        return reply(400, { error: "Invalid request" });
      if (body.action === "issue") {
        // Retry collisions; the database atomically reserves each active verifier.
        for (let attempt = 0; attempt < 8; attempt++) {
          let value;
          do {
            value = crypto.getRandomValues(new Uint32Array(1))[0];
          } while (value >= 4294000000);
          const code = (value % 1000000).toString().padStart(6, "0");
          const { data, error } = await admin.rpc("issue_watch_code", {
            p_owner: user.id,
            p_hash: await codeHash(secret, "watch-access-v1", code),
          });
          if (error) return reply(500, { error: "Unable to create code" });
          if (data?.error === "code_collision") continue;
          if (data?.error)
            return reply(429, { error: "Wait before requesting another code" });
          return reply(200, { ...data, code });
        }
        return reply(503, { error: "Unable to create code. Try again." });
      }
      if (body.action === "cancel") {
        const { error } = await admin.rpc("cancel_watch_code", {
          p_owner: user.id,
        });
        return error
          ? reply(500, { error: "Unable to cancel code" })
          : reply(200, { cancelled: true });
      }
      if (body.action === "redeem") {
        const watch =
          typeof body.watch_id === "string"
            ? body.watch_id.trim().toUpperCase()
            : "";
        const code =
          typeof body.code === "string" ? body.code.replace(/\s/g, "") : "";
        if ((watch !== "" && !/^HL-[A-F0-9]{10}$/.test(watch)) || !/^\d{6}$/.test(code))
          return reply(400, { error: "Enter the six-digit code from your watch" });
        // Rate limiting and HMAC comparison must be atomic inside the database.
        const { data, error } = await admin.rpc("redeem_watch_code", {
          p_browser: user.id,
          p_session: claims.session_id,
          p_watch: watch,
          p_hash: await codeHash(secret, "watch-access-v1", code),
        });
        if (error) return reply(500, { error: "Unable to connect watch" });
        if (data?.error)
          return reply(data.error === "rate_limited" ? 429 : 400, {
            error: "Code unavailable. Check the watch or try again later.",
          });
        return reply(200, data);
      }
      return reply(400, { error: "Unknown action" });
    } catch {
      return reply(500, { error: "Web access unavailable" });
    }
  };
}
