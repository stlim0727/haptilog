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
