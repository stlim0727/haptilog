import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROBLEM_CATEGORIES,
  buildProblemCaptureProperties,
  buildProblemReport,
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
