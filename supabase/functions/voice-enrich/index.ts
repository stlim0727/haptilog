// Supabase Edge Function: voice-enrich
//
// Processes audio recordings + GPS location metadata using Gemini Multimodal.
// Extracts user intent, generates transcript, summaries, and structured data
// (Expense details, Travel notes, Workout stats).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") || "gemini-2.0-flash";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const SYSTEM_INSTRUCTION = `
You are HaptiLog AI, an intelligent personal logger that analyzes short voice clips with GPS location context recorded on a Galaxy Watch.
Given:
1. Audio recording of user speaking.
2. Location info (latitude, longitude, speed, altitude).

Your task:
1. Transcribe the audio verbatim.
2. Determine the primary intent from: ['EXPENSE', 'TRAVEL', 'WORKOUT', 'MEMO'].
3. Extract structured JSON data:
   - For EXPENSE: amount (number), currency (string, default "KRW"), category (string, e.g. "식비", "교통", "쇼핑"), item (string), merchant (string or null).
   - For TRAVEL: place_name (inferred from GPS or speech), description (string), mood (string).
   - For WORKOUT: workout_type (running, cycling, hiking, etc.), condition (string), speed_kmh (number or null), note (string).
   - For MEMO: title (string), content (string), action_items (string[]).

Return ONLY valid JSON matching this schema:
{
  "transcript": "...",
  "intent_type": "EXPENSE" | "TRAVEL" | "WORKOUT" | "MEMO",
  "summary": "1-line concise summary",
  "structured_data": { ... }
}
`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const { recording_id, audio_base64, audio_mime, latitude, longitude, speed } = await req.json();

    if (!recording_id) {
      return new Response(JSON.stringify({ error: "recording_id required" }), { status: 400 });
    }

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Prepare prompt with metadata
    const contextText = `GPS Context:
Latitude: ${latitude ?? "Unknown"}, Longitude: ${longitude ?? "Unknown"}
Speed: ${speed ?? 0} m/s`;

    const contents: any[] = [
      {
        role: "user",
        parts: [
          { text: contextText },
        ]
      }
    ];

    if (audio_base64) {
      contents[0].parts.unshift({
        inline_data: {
          mime_type: audio_mime || "audio/mp4",
          data: audio_base64
        }
      });
    }

    // Call Gemini API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.2
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API Error: ${err}`);
    }

    const geminiData = await response.json();
    const resultText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = JSON.parse(resultText);

    // Fetch user_id of the recording
    const { data: recording } = await supabase
      .from("recordings")
      .select("user_id")
      .eq("id", recording_id)
      .single();

    if (recording) {
      await supabase.from("voice_enrichments").insert({
        recording_id,
        user_id: recording.user_id,
        intent_type: parsed.intent_type || "MEMO",
        transcript: parsed.transcript || "",
        summary: parsed.summary || "",
        structured_data: parsed.structured_data || {}
      });
    }

    return new Response(JSON.stringify(parsed), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});
