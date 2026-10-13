export function validateRequest(value: unknown) {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v.recording_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.recording_id) ||
    typeof v.audio_base64 !== "string" || !v.audio_base64.length ||
    v.audio_base64.length > 1_800_000 || v.audio_base64.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(v.audio_base64) ||
    (v.audio_mime !== undefined && v.audio_mime !== "audio/mp4" && v.audio_mime !== "audio/m4a")) {
    throw new Error("Invalid request");
  }
  return { recording_id: v.recording_id, audio_base64: v.audio_base64,
    audio_mime: (v.audio_mime as string | undefined) ?? "audio/mp4" };
}

export function validateResult(value: unknown) {
  const v = value as Record<string, unknown> | null;
  if (!v || typeof v.transcript !== "string" || typeof v.summary !== "string" ||
    typeof v.intent_type !== "string" || !["EXPENSE", "TRAVEL", "WORKOUT", "MEMO"].includes(v.intent_type) ||
    !v.structured_data || typeof v.structured_data !== "object" || Array.isArray(v.structured_data)) {
    throw new Error("Invalid enrichment");
  }
  return { transcript: v.transcript, summary: v.summary, intent_type: v.intent_type,
    structured_data: v.structured_data };
}
