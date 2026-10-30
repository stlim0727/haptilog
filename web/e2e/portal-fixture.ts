import { expect, type Page } from "@playwright/test";
const browserId = "66666666-6666-4666-8666-666666666666";
const sessionId = "77777777-7777-4777-8777-777777777777";
const owner = "11111111-1111-4111-8111-111111111111";
const connection = {
  session_id: sessionId,
  browser_user_id: browserId,
  owner_user_id: owner,
  watch_id: "HL-0123456789",
  expires_at: "2099-01-01T00:00:00Z",
};
export const portalSession = {
  access_token: `header.${
    btoa(
      JSON.stringify({
        sub: browserId,
        session_id: sessionId,
        exp: 4070908800,
      }),
    )
  }.signature`,
  refresh_token: "test-refresh",
  expires_at: 4070908800,
  expires_in: 3600,
  token_type: "bearer",
  user: {
    id: browserId,
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-10-16T00:00:00Z",
    is_anonymous: true,
  },
};
export const baseRecording = {
  id: "33333333-3333-4333-8333-333333333333",
  user_id: owner,
  audio_path: `${owner}/33333333-3333-4333-8333-333333333333.m4a`,
  recorded_at: "2026-10-16T12:00:00Z",
  created_at: "2026-10-16T12:00:00Z",
  duration_seconds: 14,
  latitude: 37.541,
  longitude: 127.056,
  accuracy: 8,
  altitude: 24,
  speed: 1.2,
  voice_enrichments: [
    {
      pipeline_version: "v1",
      created_at: "2026-10-16T12:01:00Z",
      intent_type: "EXPENSE",
      summary: "Coffee on the corner",
      transcript: "아이스 라떼 5,000원",
      structured_data: {
        amount: 5000,
        currency: "KRW",
        merchant: "Corner coffee",
      },
    },
  ],
  enrichment_status: null,
  recording_corrections: null,
};
export async function fixture(
  page: Page,
  { connected = true, failed = false, google = false, saved = false } = {},
) {
  page.on("dialog", (dialog) => dialog.accept());
  const activeSession = google ? { ...portalSession, user: { ...portalSession.user, is_anonymous: false,
    email: "test@example.com", identities: [{ provider: "google", user_id: browserId }] } } : portalSession;
  const state = {
    paired: connected,
    accountWatches: saved ? [{ owner_user_id: owner, watch_id: connection.watch_id }] : [] as { owner_user_id: string; watch_id: string }[],
    accountOperations: [] as string[],
    accountFailure: false,
    recording: structuredClone(baseRecording) as any,
    retry: 0,
    retryBodies: [] as any[],
    retryFailure: null as string | null,
    corrections: [] as any[],
    history: [] as any[],
    audioLoads: 0,
    additional: [] as any[],
  };
  if (failed) {
    state.recording.voice_enrichments = [];
    state.recording.enrichment_status = {
      state: "FAILED",
      lease_until: "2026-10-16T12:00:00Z",
    };
  }
  if (connected || google) {
    await page.addInitScript(
      (session) =>
        localStorage.setItem(
          "haptilog-portal-session",
          JSON.stringify(session),
        ),
      activeSession,
    );
  }
  await page.route("https://haptilog-test.supabase.co/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    let body: unknown;
    if (path.endsWith("/location_stays")) body = {
      protocol_version: 1,
      state: { consent_enabled: false, consent_revision: 0, sync_epoch: 0, upload_cutoff: null, places_revision: 0, applied_places_revision: 0, threshold_minutes: 10 },
      places: [], stays: [], deleted_ids: [],
    };
    else if (path.endsWith("/signup")) body = activeSession;
    else if (path.endsWith("/user")) body = activeSession.user;
    else if (path.endsWith("/notion-export")) {
      body = { configured: false, connected: false, target: null, exports: [] };
    } else if (path.endsWith("/set_cloud_consent")) {
      return route.fulfill({ status: 204 });
    } else if (path.endsWith("/logout")) return route.fulfill({ status: 204 });
    else if (path.endsWith("/watch-access")) {
      const input = req.postDataJSON();
      if (input.action === "account") {
        state.accountOperations.push(input.operation);
        if (state.accountFailure) return route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "denied" }) });
        if (input.operation === "restore") state.paired = true;
        if (input.operation === "save") state.accountWatches = [{ owner_user_id: owner, watch_id: connection.watch_id }];
        if (input.operation === "unlink") { state.accountWatches = []; state.paired = false; }
        body = { watches: state.accountWatches };
      } else {
        expect(input).toEqual({ action: "redeem", code: "123456" });
        state.paired = true;
        if (google) state.accountWatches = [{ owner_user_id: owner, watch_id: connection.watch_id }];
        body = { watch_id: connection.watch_id };
      }
    } else if (path.endsWith("/portal_connections")) {
      if (req.method() === "PATCH") {
        state.paired = false;
        return route.fulfill({ status: 204 });
      }
      body = state.paired ? [connection] : [];
    } else if (path.endsWith("/recordings")) {
      if (req.method() === "PATCH") {
        const patch = req.postDataJSON();
        const blocked = patch.deleted_at === null &&
          state.recording?.purging_at;
        if (state.recording && !blocked) {
          state.recording = { ...state.recording, ...patch };
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(
            blocked ? [] : [state.recording].filter(Boolean),
          ),
        });
      } else if (req.method() === "DELETE") {
        state.recording = null;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: "[]",
        });
      }
      body = [state.recording, ...state.additional].filter(Boolean);
    } else if (path.endsWith("/recording_correction_history")) {
      body = [...state.history].reverse();
    } else if (path.endsWith("/recording_corrections")) {
      const patch = req.postDataJSON();
      state.history.push({
        id: state.history.length + 1,
        created_at: new Date().toISOString(),
        before_value: state.recording.recording_corrections,
        after_value: { ...state.recording.recording_corrections, ...patch },
      });
      state.corrections.push(patch);
      state.recording.recording_corrections = {
        ...(state.recording.recording_corrections ?? {}),
        ...patch,
      };
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: "",
      });
    } else if (path.endsWith("/voice-enrich")) {
      state.retry++;
      state.retryBodies.push(req.postDataJSON());
      if (state.retryFailure) {
        return route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            error: "AI provider request failed",
            code: state.retryFailure,
          }),
        });
      }
      state.recording.voice_enrichments = structuredClone(
        baseRecording.voice_enrichments,
      );
      state.recording.enrichment_status = {
        state: "COMPLETED",
        lease_until: "2026-10-16T12:00:00Z",
      };
      body = {};
      expect(req.postDataJSON()).toMatchObject({
        recording_id: baseRecording.id,
      });
    } else if (path.includes("/storage/v1/object/")) {
      state.audioLoads++;
      return route.fulfill({
        status: 200,
        contentType: "audio/mp4",
        body: Buffer.from("test audio"),
      });
    } else throw new Error(`Unexpected request ${req.method()} ${path}`);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return state;
}
