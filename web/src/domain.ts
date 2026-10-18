export type Enrichment = {
  pipeline_version: string | null;
  created_at: string;
  transcript: string;
  summary: string;
  intent_type: string;
  structured_data: Record<string, unknown>;
};
export type Correction = {
  recording_id: string;
  amount: number | null;
  currency: string | null;
  merchant: string | null;
  category: string | null;
  completed_tasks: string[];
  updated_at: string;
};
export type Recording = {
  id: string;
  user_id: string;
  audio_path: string | null;
  recorded_at: string;
  created_at: string;
  duration_seconds: number | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  speed: number | null;
  accuracy: number | null;
  voice_enrichments: Enrichment[];
  enrichment_status: {
    state: string;
    lease_until: string;
    error_code?: string | null;
  } | null;
  recording_corrections: Correction | null;
  deleted_at?: string | null;
};
export function latest(recording: Recording) {
  return [...recording.voice_enrichments].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0];
}
export function processingState(r: Recording, now = Date.now()) {
  const status = r.enrichment_status;
  if (status?.state === "PROCESSING") {
    return Date.parse(status.lease_until) > now ? "Processing" : "Interrupted";
  }
  if (status?.state === "FAILED") return "Needs attention";
  if (latest(r)) return "Ready";
  return r.audio_path ? "Awaiting analysis" : "Audio unavailable";
}
export function analysisFailure(code?: string | null) {
  switch (code) {
    case "MODEL_UNAVAILABLE":
      return "The analysis model is unavailable. Your audio is saved; retry after the service is updated.";
    case "PROVIDER_RATE_LIMIT":
      return "The AI service reached its quota or rate limit. Your audio is saved; try again later.";
    case "PROVIDER_CONFIGURATION":
      return "The AI service configuration needs attention. Your original audio is saved.";
    case "PROVIDER_UNAVAILABLE":
      return "The AI service is temporarily unavailable. Your audio is saved; try again later.";
    case "INVALID_ANALYSIS":
      return "The AI response could not be read. Your audio is saved; retry analysis.";
    default:
      return "Analysis did not complete. Your original audio is saved. Retry analysis to try again.";
  }
}
export function hasLocation(
  r: Pick<Recording, "latitude" | "longitude">,
): r is Recording & { latitude: number; longitude: number } {
  return typeof r.latitude === "number" && Number.isFinite(r.latitude) &&
    Math.abs(r.latitude) <= 90 &&
    typeof r.longitude === "number" && Number.isFinite(r.longitude) &&
    Math.abs(r.longitude) <= 180;
}
export function expense(r: Recording) {
  const e = latest(r);
  if (e?.intent_type !== "EXPENSE") return null;
  const data = e.structured_data,
    correction = r.recording_corrections;
  const amount = correction?.amount ?? data.amount;
  const currency = correction?.currency ?? data.currency;
  return {
    amount: typeof amount === "number" && Number.isFinite(amount) && amount >= 0
      ? amount
      : null,
    currency: typeof currency === "string" && /^[A-Z]{3}$/.test(currency)
      ? currency
      : null,
    merchant: correction?.merchant ??
      (typeof data.merchant === "string" ? data.merchant : ""),
    category: correction?.category ??
      (typeof data.category === "string" ? data.category : ""),
  };
}
export function totals(recordings: Recording[]) {
  const grouped: Record<string, number> = {};
  let incomplete = 0;
  for (const r of recordings) {
    const e = expense(r);
    if (!e) continue;
    if (e.amount === null || !e.currency) {
      incomplete++;
      continue;
    }
    grouped[e.currency] = (grouped[e.currency] ?? 0) + e.amount;
  }
  return { grouped, incomplete };
}
export function localDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}
export function money(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}
export function taskItems(r: Recording) {
  const items = latest(r)?.structured_data.action_items;
  if (!Array.isArray(items)) return [];
  return items.filter((v): v is string => typeof v === "string");
}
export function csv(recordings: Recording[]) {
  const cell = (v: unknown) => {
    let text = v == null ? "" : String(v);
    // Spreadsheet applications may execute untrusted AI/transcript content.
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return (
    "\uFEFF" +
    [
      [
        "recorded_at",
        "category",
        "amount",
        "currency",
        "merchant",
        "summary",
        "transcript",
      ],
      ...recordings.map((r) => {
        const e = latest(r),
          x = expense(r);
        return [
          r.recorded_at,
          x?.category || e?.intent_type,
          x?.amount,
          x?.currency,
          x?.merchant,
          e?.summary,
          e?.transcript,
        ];
      }),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}

export function resolveStorageDeletions(
  items: Array<{ id: string; audio_path: string | null }>,
  removedObjects: Array<{ name: string }> | null,
  cleared: Set<string> = new Set(),
): { successfulIds: string[]; failedIds: string[] } {

  const removedNames = new Set((removedObjects ?? []).map((o) => o.name));
  const successfulIds: string[] = [];
  const failedIds: string[] = [];

  for (const item of items) {
    if (!item.audio_path || cleared.has(item.id)) {
      successfulIds.push(item.id);
      continue;
    }
    const fileName = item.audio_path.split("/").pop();
    if ((fileName && removedNames.has(fileName)) || removedNames.has(item.audio_path)) {
      cleared.add(item.id);
      successfulIds.push(item.id);
    } else {
      failedIds.push(item.id);
    }
  }

  return { successfulIds, failedIds };
}
