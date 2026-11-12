import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROBLEM_CATEGORIES,
  buildProblemCaptureProperties,
  buildProblemReport,
  submitProblemReport,
} from "./problem-report.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const RECORDING = "22222222-2222-4222-8222-222222222222";
const newId = () => "33333333-3333-4333-8333-333333333333";

test("builds an app_reports row matching the watch inbox shape", () => {
  const result = buildProblemReport(
    { userId: USER, recordingId: RECORDING, category: "audio", note:  " mic died ", view: "timeline", locale: "en-US" },
    newId,
  );
  assert.equal(result.error, undefined);
  const { row } = result;
  assert.equal(row.id, newId());
  assert.equal(row.user_id, USER);
  assert.equal(row.kind, "issue");
  assert.equal(row.description, "mic died");
  assert.equal(row.diagnostics.source, "web");
  assert.equal(row.diagnostics.category, "audio");
  assert.equal(row.diagnostics.view, "timeline");
  assert.equal(row.diagnostics.recording_id, RECORDING);
});

test("rejects invalid categories, ids, and non-uuid user ids", () => {
  assert.deepEqual(
    Object.keys(buildProblemReport({ userId: USER, recordingId: null, category: "billing", note: "", view: "mobile" }, newId)),
    ["error"],
  );
  assert.equal(buildProblemReport({ userId: "not-a-uuid", category: "audio", note: "", view: "mobile" }, newId).error, "invalid_user_id");
  assert.equal(buildProblemReport({ userId: USER, recordingId: "nope", category: "audio", note: "", view: "mobile" }, newId).error, "invalid_recording_id");
  for (const category of ["audio", "transcription", "location", "sync", "notion", "other"]) {
    assert.equal(buildProblemReport({ userId: USER, category, note: "", view: "mobile" }, newId).row?.kind, "issue");
  }
  assert.equal(PROBLEM_CATEGORIES.length, 6);
});

test("notes are trimmed and capped at the column limit", () => {
  const long = buildProblemReport({ userId: USER, category: "other", note: "x".repeat(1500), view: "mobile" }, newId);
  assert.equal(long.row.description.length, 1000);
});

function submitDeps(overrides = {}) {
  const calls = [];
  const deps = {
    getSession: async () => ({ session: { user: { id: USER } }, error: null }),
    insert: async row => { calls.push(["insert", row]); return null; },
    capture: (event, properties) => calls.push(["capture", event, properties]),
    analyticsSessionId: () => "an-sess",
    portalSessionId: "portal-sess",
    newId,
    ...overrides,
  };
  return { calls, deps };
}

const draft = { recordingId: RECORDING, category: "audio", note: "mic died", view: "timeline" };

test("successful submit inserts once and captures afterwards", async () => {
  const { calls, deps } = submitDeps();
  const outcome = await submitProblemReport(draft, deps);
  assert.deepEqual(outcome, { ok: true });
  assert.deepEqual(calls.map(([name]) => name), ["insert", "capture"]);
  assert.equal(calls[0][1].user_id, USER);
  assert.equal(calls[1][1], "problem_reported");
  assert.equal(calls[1][2].problem_report_id, newId());
  assert.equal(calls[1][2].portal_session_id, "portal-sess");
});

test("missing session is reported separately and never inserts", async () => {
  const { calls, deps } = submitDeps({ getSession: async () => ({ session: null, error: null }) });
  const outcome = await submitProblemReport(draft, deps);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "no_session");
  assert.equal(calls.length, 0);
});

test("session lookup errors are reported as no_session with their detail", async () => {
  const { deps } = submitDeps({
    getSession: async () => ({ session: null, error: { message: "JWT expired" } }),
  });
  const outcome = await submitProblemReport(draft, deps);
  assert.equal(outcome.reason, "no_session");
  assert.equal(outcome.detail, "JWT expired");
});

test("validation failures keep the specific reason and never insert", async () => {
  const { calls, deps } = submitDeps();
  const outcome = await submitProblemReport({ ...draft, category: "billing" }, deps);
  assert.equal(outcome.reason, "validation");
  assert.equal(outcome.detail, "invalid_category");
  assert.equal(calls.length, 0);
});

test("insert failures carry the Postgres code and message", async () => {
  const { calls, deps } = submitDeps({
    insert: async () => ({ code: "42501", message: "new row violates row-level security policy", details: "policy" }),
  });
  const outcome = await submitProblemReport(draft, deps);
  assert.equal(outcome.reason, "insert");
  assert.equal(outcome.code, "42501");
  assert.match(outcome.detail, /row-level security/);
  assert.deepEqual(calls, []);
});

test("network failures keep an empty code so callers can label them", async () => {
  const { deps } = submitDeps({ insert: async () => ({ code: "", message: "Failed to fetch" }) });
  const outcome = await submitProblemReport(draft, deps);
  assert.equal(outcome.reason, "insert");
  assert.equal(outcome.code, "");
  assert.equal(outcome.detail, "Failed to fetch");
});

test("a 23505 conflict is a failure, not silent success", async () => {
  const { calls, deps } = submitDeps({
    insert: async () => ({ code: "23505", message: "duplicate key value violates unique constraint" }),
  });
  const outcome = await submitProblemReport(draft, deps);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "conflict");
  assert.match(outcome.detail, /duplicate key/);
  assert.equal(calls.length, 0);
});

test("capture properties carry record context and session ids", () => {
  const { row } = buildProblemReport({ userId: USER, recordingId: RECORDING, category: "sync", note: "stuck", view: "calendar" }, newId);
  const props = buildProblemCaptureProperties(row, "an-sess", "portal-sess");
  assert.equal(props.problem_report_id, row.id);
  assert.equal(props.recording_id, RECORDING);
  assert.equal(props.category, "sync");
  assert.equal(props.view, "calendar");
  assert.equal(props.has_note, true);
  assert.equal(props.analytics_session_id, "an-sess");
  assert.equal(props.portal_session_id, "portal-sess");
});
