# Notion inbox export

Implements issue #21's initial scope: manually send selected uploaded recordings from the review portal to one Notion inbox. Each recording becomes one page. Explicit resend updates that page; AI analysis and corrections alone never trigger a delivery. The portal exposes per-record delivery status, partial batch results, and explicit retry. English and Korean controls are included.

## Daily background sync scope

This is the export foundation, not the complete requested integration. The desired default is silent daily server-side sync after a one-time connection, with an optional Sync now control. Before this draft is ready, add durable owner-scoped automation consent independent of browser grant expiry, a scheduled worker, persisted change tracking and retry/backoff, and settings that report failures requiring reconnection. The current browser-session credential lifecycle and manual selection UI must be revised for that behavior. Issue #21 remains open.

## User flow and destination

Create a separate table in Notion, such as **HaptiLog inbox**. Connect Notion from the portal and share that table in the OAuth picker. Select the table under **Choose inbox**. Existing database titles, including Korean titles, are supported. A database with multiple data sources exposes each source as a separate selectable destination.

Selecting a destination adds missing managed fields, after checking for incompatible existing fields:

| Field | Type | Value |
| --- | --- | --- |
| Existing title field | Title | Short analysis summary, or recording timestamp |
| Recorded at | Date | Original capture timestamp |
| Type | Text | Analysis intent or VOICE |
| HaptiLog ID | Text | Immutable recording UUID; used for recovery |
| HaptiLog | URL | Authenticated portal link to that recording |

An incompatible existing field is reported, never replaced. Automatic inbox creation and arbitrary field mapping are deferred.

A single code block labeled **HaptiLog — managed content (replaced on resend)** contains the capture timestamp, type, portal URL, summary, transcript, and structured details in plain text. This intentionally uses one replaceable block so updates can be retried without deleting sibling notes or appending duplicate content. Users should add personal notes outside this block. Missing or moved managed blocks fail safely; restore the block before resending.

User corrections override generated transcript, amount, currency, merchant, and category, including empty transcript edits and zero amounts. Completed task text is included. Missing analysis is represented explicitly. Content exceeding the export bound is rejected rather than truncated. Transcript and details remain plain text; generated content cannot introduce Notion mentions or executable embeds.

Original audio stays in HaptiLog's existing private storage. A portal link does not convey access; visitors still need an active watch pairing. Deep links select the recording within the portal's current latest-500-record window. Exports are independent external copies: disconnecting, trashing, or permanently deleting a HaptiLog recording does not delete the Notion page.

## Identity and credential lifecycle

A Notion connection belongs to the current paired **browser session**, not the anonymous watch owner globally. Another paired browser must connect Notion separately. Every handler action verifies the bearer token with Auth `getUser`, then checks the exact browser user/session against an active, unrevoked `portal_connections` row. Every external request rechecks the grant and operation lease. Export reads the persisted recording under that grant's watch owner and excludes trashed/purging recordings; caller-supplied content and owner IDs are ignored.

OAuth uses a random 256-bit state, stores only its SHA-256 digest with a ten-minute expiry, and consumes it once in the same authenticated browser session. The browser strips callback parameters from its URL before rendering. The code is exchanged server-side. OAuth access and refresh tokens are AES-GCM encrypted with a separate 32-byte server secret and the browser session ID as authenticated associated data. Tokens, state hashes, and lease claims are never returned to clients. Token refresh occurs at most once on a 401 and persists the rotated pair before retrying.

The server-only `notion_connections` and `notion_exports` tables explicitly revoke browser/anonymous grants and enable RLS without client policies. The operation RPC is service-only and security invoker. A private definer trigger erases connection credentials, OAuth state, and leases on watch/browser grant revocation or reassignment. Expiry blocks subsequent use; expired encrypted rows may remain until the portal grant is deleted or explicitly cleaned up. Disconnect clears the session's local credentials and target but leaves delivery checkpoints and external pages. It does not revoke a workspace-wide Notion authorization, which could affect other browser sessions. Users can also revoke access in Notion.

There are no background delivery jobs or automatic retries. Once a batch starts, each record is attempted at most once. The UI stops the remaining batch on access loss, a disconnected integration, unavailable destination, rate limiting, or another active operation. Unmounting stops new batch requests. A request already accepted by Notion can finish during a concurrent revocation; later requests fail the live grant check.

## Concurrency and recovery

A two-minute service-only lease serializes operations per browser session, including OAuth refresh and target changes. An advisory transaction lock and active-target lease check serialize exports to the same data source across sessions. Claims have a one-second minimum interval; local batches space requests accordingly. Notion requests are paced at least 350 ms apart within an operation, with 12-second per-request timeouts. A provider 429 is surfaced for a later explicit retry, without an automatic retry loop.

Delivery checkpoints use `(data_source_id, recording_id)` as their primary key, so reconnecting or changing browsers does not forget an existing page for that target. Before creating, the handler queries the source by HaptiLog ID. More than one match fails with a duplicate warning. The creation payload includes the ID property and managed content block together.

Before a create request, `create_pending` is durably set. If the response is lost, the next attempt searches for the existing page and resumes its update. If no page is visible yet, it reports `RECOVERY_PENDING` and never issues a second create. Definitive HTTP rejections (400/401/403/404/429) permit a later explicit create retry; ambiguous network/server failures retain the checkpoint. Once the page ID is known, failures resume updates to that ID. Page parent and managed-block parent/marker are verified before writes. Last successful export time survives a later failed update.

**Recovery limit:** the Notion API and database do not share a transaction. An uncertain create that truly never reached Notion can remain pending indefinitely. An operator must verify the absence of the page and any outstanding Notion request before resetting that specific checkpoint. The UI never guesses and creates a duplicate. Deleting the remote page, changing its HaptiLog ID before recovery, or deleting its managed block requires repair in Notion; automatic replacement pages are deliberately avoided.

## Server configuration and deployment

1. Create a **public Notion connection** in the Notion developer portal. Enable read, insert, and update content capabilities. Configure the exact OAuth redirect URI:
   `https://haptilog.keepory.app/?notion=callback`
2. Configure these Supabase Edge Function secrets through the deployment environment or dashboard (never through `VITE_` values):
   - `NOTION_CLIENT_ID`: the public connection's client ID.
   - `NOTION_CLIENT_SECRET`: its client secret.
   - `NOTION_TOKEN_KEY`: a base64-encoded cryptographically random 32-byte key. Keep it stable; changing it requires reauthorization of existing connections.
   - `NOTION_PORTAL_URL`: `https://haptilog.keepory.app` (or an explicit preview origin). The callback is derived as `/?notion=callback` on this URL. Local development supports `http://127.0.0.1:<port>`.
3. Apply `20261023084731_notion_inbox.sql` after existing migrations. It does not modify raw capture, analysis, or correction tables. All newly created tables/functions have explicit grants.
4. Deploy the `notion-export` function using the checked-in `verify_jwt=false` setting: the handler performs token verification and live grant checks itself.
5. Build and deploy the web portal after the backend. No watch release is needed.
6. Pair the browser, open **Notion inbox**, connect, choose the shared inbox, and export a test recording.

An unconfigured integration shows an explanatory message and does not block recording review, analysis, or playback. The status action provides configuration readiness without creating users or sending data to Notion. Production deployment and live acceptance require a real public Notion connection and authorized test destination; mocks do not prove those credentials or permissions.

## Validation

```sh
node --experimental-strip-types --test tests/notion-export.test.mjs
npm test --prefix supabase/tests
npm test --prefix web
npm run build --prefix web
deno check --lock=supabase/functions/deno.lock supabase/functions/notion-export/index.ts
cd web && npm run test:e2e
```

On the managed host, use the headless Chrome skill's project session; the browser fixture reuses `CHROME_DEBUG_PORT` when supplied. CI launches its normal isolated Playwright browser.

Live acceptance: connect a test workspace, select a new inbox, send an unanalyzed record and a corrected analyzed record, resend and verify one page each, add sibling notes and confirm preservation, interrupt a delivery and retry, remove destination access, disconnect, and revoke browser access from the watch. Confirm no new delivery occurs after revocation and raw audio remains available throughout.

References: [Notion authorization](https://developers.notion.com/guides/get-started/authorization), [search](https://developers.notion.com/reference/post-search), [data-source queries](https://developers.notion.com/reference/query-a-data-source), [create page](https://developers.notion.com/reference/post-page), [update block](https://developers.notion.com/reference/update-a-block), and [Supabase function authentication](https://supabase.com/docs/guides/functions/auth). The implementation pins Notion API version `2026-03-11`.
