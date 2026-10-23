import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { exportContent, MARKER, validateTarget } from "./content.ts";
import { hash, seal, unseal } from "./crypto.ts";

type Dependencies = {
  env: (name: string) => string | undefined;
  createClient: (
    url: string,
    key: string,
    options: { auth: { persistSession: boolean } },
  ) => SupabaseClient;
  fetch?: typeof fetch;
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
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const errorCodes = new Set([
  "ACCESS_REQUIRED",
  "BUSY",
  "CONNECT_REQUIRED",
  "TARGET_REQUIRED",
  "TARGET_SCHEMA",
  "NOTION_PERMISSION",
  "NOTION_UNAVAILABLE",
  "NOTION_RATE_LIMIT",
  "RECONNECT_REQUIRED",
  "RECORDING_UNAVAILABLE",
  "RECOVERY_PENDING",
  "DUPLICATE_REMOTE",
  "MANAGED_BLOCK_MISSING",
  "CONTENT_TOO_LARGE",
  "OAUTH_EXPIRED",
  "INVALID_REQUEST",
  "NOT_CONFIGURED",
]);
class Failure extends Error {
  readonly status: number;
  readonly createRejected: boolean;
  constructor(message: string, status = 400, createRejected = false) {
    super(message);
    this.status = status;
    this.createRejected = createRejected;
  }
}
function checked<T extends { error: unknown }>(result: T): T {
  if (result.error) throw new Failure("STORAGE_UNAVAILABLE", 503);
  return result;
}
async function readBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new Failure("INVALID_REQUEST");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 8192) {
      await reader.cancel();
      throw new Failure("INVALID_REQUEST", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    const body = JSON.parse(new TextDecoder().decode(bytes));
    if (!body || Array.isArray(body) || typeof body !== "object") {
      throw new Error();
    }
    return body;
  } catch {
    throw new Failure("INVALID_REQUEST");
  }
}
export function createNotionHandler(deps: Dependencies) {
  const request = deps.fetch ?? fetch;
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers });
    if (req.method !== "POST") return reply(405, { error: "POST_REQUIRED" });
    const bearer = req.headers.get("Authorization")?.match(/^Bearer (.+)$/)
      ?.[1];
    if (!bearer) return reply(401, { error: "ACCESS_REQUIRED" });
    let admin: SupabaseClient | undefined, session = "", claim = "";
    try {
      const url = deps.env("SUPABASE_URL"),
        serviceKey = deps.env("SUPABASE_SERVICE_ROLE_KEY");
      if (!url || !serviceKey) throw new Failure("NOT_CONFIGURED", 503);
      admin = deps.createClient(url, serviceKey, {
        auth: { persistSession: false },
      });
      const { data: { user }, error } = await admin.auth.getUser(bearer);
      if (error || !user) throw new Failure("ACCESS_REQUIRED", 401);
      let claims;
      try {
        claims = JSON.parse(
          atob(bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
      } catch {
        throw new Failure("ACCESS_REQUIRED", 401);
      }
      if (!uuid(claims.session_id) || claims.sub !== user.id) {
        throw new Failure("ACCESS_REQUIRED", 401);
      }
      session = claims.session_id;
      const db = admin;
      async function grant() {
        const { data } = checked(
          await db.from("portal_connections").select("owner_user_id")
            .eq("session_id", session).eq("browser_user_id", user!.id)
            .is("revoked_at", null).gt("expires_at", new Date().toISOString())
            .maybeSingle(),
        );
        if (!data) throw new Failure("ACCESS_REQUIRED", 403);
        return data;
      }
      const access = await grant();
      const body = await readBody(req);
      const clientId = deps.env("NOTION_CLIENT_ID"),
        clientSecret = deps.env("NOTION_CLIENT_SECRET");
      const encryptionKey = deps.env("NOTION_TOKEN_KEY"),
        portal = deps.env("NOTION_PORTAL_URL");
      let redirect = "";
      try {
        const p = new URL(portal ?? "");
        if (
          p.protocol !== "https:" &&
          !(p.protocol === "http:" && p.hostname === "127.0.0.1")
        ) throw new Error();
        p.pathname = "/";
        p.search = "?notion=callback";
        p.hash = "";
        redirect = p.href;
        if (atob(encryptionKey ?? "").length !== 32) throw new Error();
      } catch {
        /* Unconfigured integration is visible, but never disables the portal. */
      }
      const configured = Boolean(
        clientId && clientSecret && encryptionKey && redirect && (() => {
          try {
            return atob(encryptionKey).length === 32;
          } catch {
            return false;
          }
        })(),
      );
      const { data: current } = checked(
        await db.from("notion_connections").select("*").eq(
          "session_id",
          session,
        ).maybeSingle(),
      );
      if (body.action === "status") {
        let exports: unknown[] = [];
        if (current?.data_source_id) {
          // Match the portal's latest-500 capture window before filtering trash.
          // Limiting checkpoints themselves can omit visible successes/failures.
          const window = checked(
            await db.from("recordings")
              .select("id,deleted_at,purging_at")
              .eq("user_id", access.owner_user_id)
              .order("recorded_at", { ascending: false }).limit(500),
          ).data ?? [];
          const ids = window.filter((r) => !r.deleted_at && !r.purging_at).map(
            (r) => r.id,
          );
          if (ids.length) {
            const result = checked(
              await db.from("notion_exports")
                .select("recording_id,state,error_code,exported_at")
                .eq("data_source_id", current.data_source_id).in(
                  "recording_id",
                  ids,
                ),
            );
            exports = (result.data ?? []).map((
              { recording_id, state, error_code, exported_at },
            ) => ({ recording_id, state, error_code, exported_at }));
          }
        }
        return reply(200, {
          configured,
          connected: Boolean(current?.token_cipher),
          workspace: current?.workspace_name,
          target: current?.data_source_id
            ? { id: current.data_source_id, name: current.target_name }
            : null,
          exports,
        });
      }
      if (!configured && body.action !== "disconnect") {
        throw new Failure("NOT_CONFIGURED", 503);
      }
      claim = crypto.randomUUID();
      const claimed = checked(
        await db.rpc("claim_notion_operation", {
          p_session: session,
          p_browser: user.id,
          p_claim: claim,
        }),
      ).data;
      if (claimed?.error) {
        throw new Failure(claimed.error, claimed.error === "BUSY" ? 409 : 403);
      }
      if (!claimed) {
        throw new Failure("STORAGE_UNAVAILABLE", 503);
      }
      async function guard() {
        await grant();
        const { data } = checked(
          await db.from("notion_connections").select("session_id")
            .eq("session_id", session).eq("claim_token", claim).gt(
              "lease_until",
              new Date().toISOString(),
            ).maybeSingle(),
        );
        if (!data) throw new Failure("ACCESS_REQUIRED", 403);
      }
      async function saveConnection(values: Record<string, unknown>) {
        await guard();
        const { data } = checked(
          await db.from("notion_connections").update(values)
            .eq("session_id", session).eq("claim_token", claim).select(
              "session_id",
            ).maybeSingle(),
        );
        if (!data) throw new Failure("ACCESS_REQUIRED", 403);
      }
      async function oauth(payload: Record<string, unknown>) {
        await guard();
        const response = await request(
          "https://api.notion.com/v1/oauth/token",
          {
            method: "POST",
            signal: AbortSignal.timeout(12000),
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
            },
            body: JSON.stringify(payload),
          },
        );
        if (!response.ok) {
          throw new Failure(
            response.status >= 500
              ? "NOTION_UNAVAILABLE"
              : "RECONNECT_REQUIRED",
            502,
          );
        }
        const tokens = await response.json();
        if (!tokens.access_token || !tokens.refresh_token) {
          throw new Failure("RECONNECT_REQUIRED");
        }
        return tokens;
      }
      if (body.action === "disconnect") {
        await saveConnection({
          token_cipher: null,
          workspace_name: null,
          data_source_id: null,
          target_name: null,
          oauth_hash: null,
          oauth_expires_at: null,
        });
        return reply(200, { disconnected: true });
      }
      if (body.action === "authorize") {
        const state = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
        await saveConnection({
          oauth_hash: await hash(state),
          oauth_expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
        });
        const auth = new URL("https://api.notion.com/v1/oauth/authorize");
        for (
          const [key, value] of Object.entries({
            client_id: clientId!,
            response_type: "code",
            owner: "user",
            redirect_uri: redirect,
            state,
          })
        ) auth.searchParams.set(key, value);
        return reply(200, { url: auth.href });
      }
      if (body.action === "complete") {
        if (
          typeof body.state !== "string" || body.state.length > 200 ||
          typeof body.code !== "string" || body.code.length > 1000
        ) throw new Failure("INVALID_REQUEST");
        const { data } = checked(
          await db.from("notion_connections").update({
            oauth_hash: null,
            oauth_expires_at: null,
          })
            .eq("session_id", session).eq("claim_token", claim).eq(
              "oauth_hash",
              await hash(body.state),
            )
            .gt("oauth_expires_at", new Date().toISOString()).select(
              "session_id",
            ).maybeSingle(),
        );
        if (!data) throw new Failure("OAUTH_EXPIRED");
        const tokens = await oauth({
          grant_type: "authorization_code",
          code: body.code,
          redirect_uri: redirect,
        });
        await saveConnection({
          token_cipher: await seal(tokens, encryptionKey!, session),
          workspace_name: tokens.workspace_name ?? "Notion",
          data_source_id: null,
          target_name: null,
        });
        return reply(200, { connected: true });
      }
      if (!claimed.token_cipher) throw new Failure("CONNECT_REQUIRED");
      let tokens = await unseal(claimed.token_cipher, encryptionKey!, session);
      let lastRequest = 0;
      async function pace() {
        const remaining = 350 - (Date.now() - lastRequest);
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
        }
        lastRequest = Date.now();
      }
      async function notion(
        path: string,
        method = "GET",
        payload?: unknown,
      ): Promise<any> {
        // Guard every external request, including recovery reads and token refresh.
        await guard();
        const send = async () => {
          await pace();
          await guard();
          return request(`https://api.notion.com/v1/${path}`, {
            method,
            signal: AbortSignal.timeout(12000),
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
              "Notion-Version": "2026-03-11",
              "Content-Type": "application/json",
            },
            ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
          });
        };
        let response = await send();
        if (response.status === 401) {
          try {
            tokens = {
              ...tokens,
              ...await oauth({
                grant_type: "refresh_token",
                refresh_token: tokens.refresh_token,
              }),
            };
            await saveConnection({
              token_cipher: await seal(tokens, encryptionKey!, session),
            });
            await guard();
          } catch (error) {
            // The first create was explicitly rejected and no second POST was
            // sent. Even a refresh timeout must allow creation after reconnect.
            if (path === "pages" && method === "POST") {
              throw new Failure(
                error instanceof Error ? error.message : "NOTION_UNAVAILABLE",
                error instanceof Failure ? error.status : 502,
                true,
              );
            }
            throw error;
          }
          // Outside the catch: a lost response to this POST is still ambiguous.
          response = await send();
        }
        if (!response.ok) {
          const code = response.status === 429
            ? "NOTION_RATE_LIMIT"
            : response.status === 401
            ? "RECONNECT_REQUIRED"
            : [403, 404].includes(response.status)
            ? "NOTION_PERMISSION"
            : response.status === 400
            ? "TARGET_SCHEMA"
            : "NOTION_UNAVAILABLE";
          throw new Failure(
            code,
            502,
            path === "pages" && method === "POST" &&
              [400, 401, 403, 404, 429].includes(response.status),
          );
        }
        return response.json();
      }
      if (body.action === "targets") {
        if (
          body.cursor != null &&
          (typeof body.cursor !== "string" || body.cursor.length > 200)
        ) throw new Failure("INVALID_REQUEST");
        const list = await notion("search", "POST", {
          filter: { property: "object", value: "data_source" },
          page_size: 50,
          ...(body.cursor ? { start_cursor: body.cursor } : {}),
        });
        return reply(200, {
          targets: list.results.map((x: any) => ({
            id: x.id,
            name: x.title?.map((t: any) =>
              t.plain_text ?? t.text?.content ?? ""
            ).join("") || "Untitled",
          })),
          cursor: list.has_more ? list.next_cursor : null,
        });
      }
      if (body.action === "target") {
        if (!uuid(body.id)) throw new Failure("INVALID_REQUEST");
        const source = await notion(`data_sources/${body.id}`);
        if (source.archived || source.in_trash) {
          throw new Failure("NOTION_PERMISSION");
        }
        // Add only missing managed fields. Never replace an incompatible user field.
        const required = {
          "Recorded at": "date",
          Type: "rich_text",
          "HaptiLog ID": "rich_text",
          HaptiLog: "url",
        };
        const missing: Record<string, unknown> = {};
        if (
          !Object.values(source.properties ?? {}).some((v: any) =>
            v.type === "title"
          )
        ) throw new Failure("TARGET_SCHEMA");
        for (const [name, type] of Object.entries(required)) {
          const p = source.properties?.[name];
          if (p && p.type !== type) throw new Failure("TARGET_SCHEMA");
          if (!p) missing[name] = { [type]: {} };
        }
        if (Object.keys(missing).length) {
          await notion(`data_sources/${body.id}`, "PATCH", {
            properties: missing,
          });
        }
        await saveConnection({
          data_source_id: body.id,
          target_name: source.title?.map((t: any) =>
            t.plain_text ?? t.text?.content ?? ""
          ).join("") || "HaptiLog inbox",
        });
        return reply(200, { saved: true });
      }
      if (
        body.action !== "export" || !uuid(body.recording_id)
      ) throw new Failure("INVALID_REQUEST");
      const target = claimed.data_source_id;
      if (!target) throw new Failure("TARGET_REQUIRED");
      const { data: recording } = checked(
        await db.from("recordings")
          .select("*,voice_enrichments(*),recording_corrections(*)").eq(
            "id",
            body.recording_id,
          )
          .eq("user_id", access.owner_user_id).is("deleted_at", null).is(
            "purging_at",
            null,
          ).maybeSingle(),
      );
      if (!recording) throw new Failure("RECORDING_UNAVAILABLE", 404);
      checked(
        await db.from("notion_exports").upsert({
          data_source_id: target,
          recording_id: recording.id,
        }, {
          onConflict: "data_source_id,recording_id",
          ignoreDuplicates: true,
        }),
      );
      let checkpoint = checked(
        await db.from("notion_exports").select("*").eq(
          "data_source_id",
          target,
        ).eq("recording_id", recording.id).single(),
      ).data;
      const saveExport = async (patch: Record<string, unknown>) => {
        await guard();
        checked(
          await db.from("notion_exports").update(patch).eq(
            "data_source_id",
            target,
          ).eq("recording_id", recording.id),
        );
        checkpoint = { ...checkpoint, ...patch };
      };
      try {
        const source = await notion(`data_sources/${target}`);
        validateTarget(source);
        const content = exportContent(recording, portal!);
        const titleProperty = Object.values(source.properties).find((p: any) =>
          p.type === "title"
        ) as { id: string };
        const properties: Record<string, unknown> = { ...content.properties };
        delete properties.Name;
        properties[titleProperty.id] = content.properties.Name;
        if (!checkpoint.page_id) {
          // Also recover a page created before this browser connected to the target.
          const found = await notion(`data_sources/${target}/query`, "POST", {
            filter: {
              property: "HaptiLog ID",
              rich_text: { equals: recording.id },
            },
            page_size: 2,
          });
          if (found.results.length > 1 || found.has_more) {
            throw new Failure("DUPLICATE_REMOTE");
          }
          if (found.results.length === 1) {
            await saveExport({ page_id: found.results[0].id });
          } else {
            if (checkpoint.create_pending) {
              throw new Failure("RECOVERY_PENDING");
            }
            await saveExport({
              create_pending: true,
              state: "PENDING",
              error_code: null,
            });
            const page = await notion("pages", "POST", {
              parent: { type: "data_source_id", data_source_id: target },
              properties,
              children: [content.block],
            });
            await saveExport({ page_id: page.id });
          }
        }
        const page = await notion(`pages/${checkpoint.page_id}`);
        if (
          page.archived || page.in_trash ||
          page.parent?.data_source_id !== target
        ) throw new Failure("NOTION_PERMISSION");
        // Locate the managed block after creation (including a lost create response).
        if (!checkpoint.block_id) {
          let cursor: string | undefined;
          const managed: string[] = [];
          for (let n = 0; n < 10; n++) {
            const list = await notion(
              `blocks/${checkpoint.page_id}/children?page_size=100${
                cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""
              }`,
            );
            for (const block of list.results) {
              if (
                block.type === "code" &&
                block.code?.caption?.map((x: any) =>
                    x.plain_text ?? x.text?.content ?? ""
                  ).join("") === MARKER
              ) managed.push(block.id);
            }
            if (!list.has_more) break;
            cursor = list.next_cursor;
            if (n === 9) throw new Failure("MANAGED_BLOCK_MISSING");
          }
          if (managed.length !== 1) throw new Failure("MANAGED_BLOCK_MISSING");
          await saveExport({ block_id: managed[0] });
        }
        const block = await notion(`blocks/${checkpoint.block_id}`);
        if (
          block.archived || block.in_trash ||
          block.parent?.page_id !== checkpoint.page_id ||
          block.type !== "code" || block.code?.caption?.map((x: any) =>
              x.plain_text ?? x.text?.content ?? ""
            ).join("") !== MARKER
        ) {
          throw new Failure("MANAGED_BLOCK_MISSING");
        }
        await notion(`pages/${checkpoint.page_id}`, "PATCH", { properties });
        await notion(`blocks/${checkpoint.block_id}`, "PATCH", {
          code: content.block.code,
        });
        const exported_at = new Date().toISOString();
        await saveExport({
          state: "EXPORTED",
          error_code: null,
          create_pending: false,
          exported_at,
        });
        return reply(200, {
          recording_id: recording.id,
          state: "EXPORTED",
          exported_at,
        });
      } catch (error) {
        const code = error instanceof Error && errorCodes.has(error.message)
          ? error.message
          : "NOTION_UNAVAILABLE";
        // On revocation saveExport fails closed; never resurrect a connection.
        await saveExport({
          state: "FAILED",
          error_code: code,
          ...(error instanceof Failure && error.createRejected
            ? { create_pending: false }
            : {}),
        });
        throw error;
      }
    } catch (error) {
      const code = error instanceof Error && errorCodes.has(error.message)
        ? error.message
        : "NOTION_UNAVAILABLE";
      return reply(error instanceof Failure ? error.status : 502, {
        error: code,
      });
    } finally {
      if (admin && session && claim) {
        await admin.from("notion_connections").update({
          claim_token: null,
          lease_until: null,
        })
          .eq("session_id", session).eq("claim_token", claim);
      }
    }
  };
}
