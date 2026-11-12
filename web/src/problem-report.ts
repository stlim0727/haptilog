export const PROBLEM_CATEGORIES = ["audio", "transcription", "location", "sync", "notion", "other"] as const;
export type ProblemCategory = (typeof PROBLEM_CATEGORIES)[number];

export const PROBLEM_CATEGORY_LABEL_KEYS = {
  audio: "report_category_audio",
  transcription: "report_category_transcription",
  location: "report_category_location",
  sync: "report_category_sync",
  notion: "report_category_notion",
  other: "report_category_other",
} as const satisfies Record<ProblemCategory, string>;

export const PROBLEM_NOTE_MAX_LENGTH = 1000;
export const PROBLEM_DIAGNOSTICS_MAX_BYTES = 8192;

export interface ProblemReportInput {
  userId: string;
  recordingId?: string | null;
  category: string;
  note: string;
  view: string;
  locale?: string;
}

export interface AppReportRow {
  id: string;
  user_id: string;
  kind: "issue";
  description: string;
  diagnostics: Record<string, unknown>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mirrors public.app_reports constraints so a client-side rejection matches RLS/check outcomes.
export function buildProblemReport(
  input: ProblemReportInput,
  newId: () => string = () => crypto.randomUUID(),
): { row: AppReportRow } | { error: string } {
  if (!UUID_PATTERN.test(input.userId)) return { error: "invalid_user_id" };
  if (!PROBLEM_CATEGORIES.includes(input.category as ProblemCategory)) return { error: "invalid_category" };
  if (input.recordingId !== null && input.recordingId !== undefined && !UUID_PATTERN.test(input.recordingId)) {
    return { error: "invalid_recording_id" };
  }
  const note = (input.note ?? "").trim().slice(0, PROBLEM_NOTE_MAX_LENGTH);
  const diagnostics = {
    source: "web",
    view: input.view,
    category: input.category,
    locale: (input.locale ?? (typeof navigator === "undefined" ? "" : navigator.language)).slice(0, 35),
    page: typeof location === "undefined" ? "" : location.pathname.slice(0, 100),
  } as Record<string, unknown>;
  if (input.recordingId) diagnostics.recording_id = input.recordingId;
  if (JSON.stringify(diagnostics).length > PROBLEM_DIAGNOSTICS_MAX_BYTES) return { error: "diagnostics_too_large" };
  return { row: { id: newId(), user_id: input.userId, kind: "issue", description: note, diagnostics } };
}

export type ProblemReportDraft = Omit<ProblemReportInput, "userId">;

export interface ProblemReportDeps {
  getSession: () => Promise<{
    session: { user: { id: string } } | null;
    error?: { message?: string } | null;
  }>;
  insert: (row: AppReportRow) => Promise<{
    code?: string | null;
    message?: string | null;
    details?: string | null;
  } | null>;
  capture: (event: string, properties: Record<string, unknown>) => void;
  analyticsSessionId: () => string;
  portalSessionId: string;
  newId?: () => string;
}

export type ProblemReportOutcome =
  | { ok: true }
  | { ok: false; reason: "no_session"; detail: string }
  | { ok: false; reason: "validation"; detail: string }
  | { ok: false; reason: "conflict"; detail: string }
  | { ok: false; reason: "insert"; code: string; detail: string };

/**
 * Submits one problem report and reports every failure mode distinctly.
 * Callers must not treat a conflict (23505) as success: ids are generated
 * per submit, so a conflict means this row was not written by this attempt.
 */
export async function submitProblemReport(
  draft: ProblemReportDraft,
  deps: ProblemReportDeps,
): Promise<ProblemReportOutcome> {
  const { session, error: sessionError } = await deps.getSession();
  if (sessionError || !session) {
    return { ok: false, reason: "no_session", detail: sessionError?.message || "no auth session" };
  }
  const built = buildProblemReport({ ...draft, userId: session.user.id }, deps.newId);
  if ("error" in built) return { ok: false, reason: "validation", detail: built.error };
  const error = await deps.insert(built.row);
  if (error) {
    const code = error.code ?? "";
    const detail = [error.message, error.details].filter(Boolean).join(" ");
    return code === "23505"
      ? { ok: false, reason: "conflict", detail: detail || "duplicate report id" }
      : { ok: false, reason: "insert", code, detail };
  }
  deps.capture(
    "problem_reported",
    buildProblemCaptureProperties(built.row, deps.analyticsSessionId(), deps.portalSessionId),
  );
  return { ok: true };
}

export function buildProblemCaptureProperties(
  row: AppReportRow,
  analyticsSessionId: string,
  portalSessionId: string,
): Record<string, unknown> {
  return {
    problem_report_id: row.id,
    recording_id: row.diagnostics.recording_id ?? null,
    category: row.diagnostics.category,
    view: row.diagnostics.view,
    has_note: row.description.length > 0,
    analytics_session_id: analyticsSessionId,
    portal_session_id: portalSessionId,
  };
}
