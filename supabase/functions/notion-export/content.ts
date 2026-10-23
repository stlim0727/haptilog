// A single managed block makes retries idempotent and preserves sibling notes.
export const MARKER = "HaptiLog — managed content (replaced on resend)";
type Json = Record<string, any>;
export function richText(text: string) {
  if (new TextEncoder().encode(text).byteLength > 350000) {
    throw new Error("CONTENT_TOO_LARGE");
  }
  const parts = [];
  let chunk = "";
  for (const char of text) {
    if (chunk.length + char.length > 1800) {
      parts.push({ type: "text", text: { content: chunk } });
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) parts.push({ type: "text", text: { content: chunk } });
  if (parts.length > 100) throw new Error("CONTENT_TOO_LARGE");
  return parts;
}
export function exportContent(recording: Json, portalUrl: string) {
  const latest = [...(recording.voice_enrichments ?? [])].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0];
  const corrections = recording.recording_corrections ?? {};
  const data = { ...(latest?.structured_data ?? {}) };
  for (const field of ["amount", "currency", "merchant", "category"]) {
    if (corrections[field] != null) data[field] = corrections[field];
  }
  if (corrections.completed_tasks?.length) {
    data.completed_tasks = corrections.completed_tasks;
  }
  const title = Array.from(
    String(latest?.summary || recording.recorded_at).replace(/\s+/g, " "),
  ).slice(0, 150).join("");
  const link = new URL(portalUrl);
  link.searchParams.set("recording", recording.id);
  const body = [
    `Recorded: ${recording.recorded_at}`,
    `Type: ${latest?.intent_type ?? "VOICE"}`,
    `HaptiLog: ${link.href}`,
    "",
    "Summary",
    latest?.summary ?? "Not analyzed yet.",
    "",
    "Transcript",
    corrections.transcript ?? latest?.transcript ?? "Not available yet.",
    "",
    "Details",
    JSON.stringify(data, null, 2),
  ].join("\n");
  const content = {
    properties: {
      Name: { title: richText(title) },
      "Recorded at": { date: { start: recording.recorded_at } },
      Type: { rich_text: richText(latest?.intent_type ?? "VOICE") },
      "HaptiLog ID": { rich_text: richText(recording.id) },
      HaptiLog: { url: link.href },
    },
    block: {
      object: "block",
      type: "code",
      code: {
        language: "plain text",
        caption: richText(MARKER),
        rich_text: richText(body),
      },
    },
  };
  if (new TextEncoder().encode(JSON.stringify(content)).byteLength > 450000) {
    throw new Error("CONTENT_TOO_LARGE");
  }
  return content;
}
export function validateTarget(source: Json) {
  const required = {
    "Recorded at": "date",
    Type: "rich_text",
    "HaptiLog ID": "rich_text",
    HaptiLog: "url",
  };
  if (
    source.archived || source.in_trash ||
    !Object.values(source.properties ?? {}).some((p: any) =>
      p.type === "title"
    ) || Object.entries(required).some(
      ([name, type]) => source.properties?.[name]?.type !== type,
    )
  ) throw new Error("TARGET_SCHEMA");
}
