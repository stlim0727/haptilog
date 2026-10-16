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
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
export function createAccessHandler(deps: Dependencies) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers });
    if (req.method !== "POST") return reply(405, { error: "POST required" });
    const token = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return reply(401, { error: "Authentication required" });
    try {
      const url = deps.env("SUPABASE_URL"),
        serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY"),
        secret = deps.env("WATCH_PAIRING_SECRET");
      if (!url || !serviceKey || !secret || secret.length < 32)
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
        // The verifier is keyed to prevent offline guessing of the six-digit space.
        // Database redemption also binds it to the selected watch and expiry.
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
        if (data?.error)
          return reply(429, { error: "Wait before requesting another code" });
        return reply(200, { ...data, code });
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
        if (!/^HL-[A-F0-9]{10}$/.test(watch) || !/^\d{6}$/.test(code))
          return reply(400, { error: "Enter the watch ID and six-digit code" });
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
