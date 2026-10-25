import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
const browserId = "22222222-2222-4222-8222-222222222222";
const sessionId = "11111111-1111-4111-8111-111111111111";
const owner = "33333333-3333-4333-8333-333333333333";
const first = "44444444-4444-4444-8444-444444444444";
const second = "55555555-5555-4555-8555-555555555555";
const connection = {
  session_id: sessionId,
  browser_user_id: browserId,
  owner_user_id: owner,
  watch_id: "HL-0123456789",
  expires_at: "2099-01-01",
};
const session = {
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
    created_at: "2026-10-23",
    is_anonymous: true,
  },
};
const recording = (id: string, summary: string) => ({
  id,
  user_id: owner,
  audio_path: null,
  recorded_at: "2026-10-23T10:00:00Z",
  created_at: "2026-10-23T10:00:00Z",
  voice_enrichments: [{
    created_at: "2026-10-23T10:01:00Z",
    summary,
    transcript: summary,
    intent_type: "MEMO",
    structured_data: {},
  }],
  recording_corrections: null,
  enrichment_status: null,
});
async function setup(page: Page, { configured = true, connected = true } = {}) {
  const state = {
    configured,
    connected,
    paired: true,
    target: connected ? { id: "target", name: "HaptiLog inbox" } : null as any,
    exports: [] as any[],
    calls: [] as any[],
    failSecond: true,
  };
  await page.addInitScript((session) => {
    localStorage.setItem("haptilog-portal-session", JSON.stringify(session));
    localStorage.setItem("haptilog_language", "en");
  }, session);
  await page.route("https://haptilog-test.supabase.co/**", async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    let body: unknown;
    let status = 200;
    if (path.endsWith("/portal_connections")) {
      body = state.paired ? [connection] : [];
    } else if (path.endsWith("/recordings")) {
      body = [recording(first, "First memo"), recording(second, "Second memo")];
    } else if (path.endsWith("/notion-export")) {
      const input = req.postDataJSON();
      state.calls.push(input);
      if (input.action === "status") {
        body = {
          configured: state.configured,
          connected: state.connected,
          target: state.target,
          exports: state.exports,
          workspace: "Workspace",
        };
      } else if (input.action === "export") {
        const fail = state.failSecond && input.recording_id === second;
        const item = {
          recording_id: input.recording_id,
          state: fail ? "FAILED" : "EXPORTED",
          error_code: fail ? "NOTION_UNAVAILABLE" : null,
          exported_at: fail ? null : "2026-10-23T10:10:00Z",
        };
        state.exports = [
          ...state.exports.filter((x) => x.recording_id !== input.recording_id),
          item,
        ];
        if (fail) {
          status = 502;
          body = { error: "NOTION_UNAVAILABLE" };
        } else body = item;
      } else if (input.action === "disconnect") {
        state.connected = false;
        state.target = null;
        state.exports = [];
        body = { disconnected: true };
      } else if (input.action === "complete") {
        state.connected = true;
        state.target = null;
        body = { connected: true };
      } else if (input.action === "targets") {
        body = {
          targets: [{ id: "target", name: "HaptiLog inbox" }],
          cursor: null,
        };
      } else if (input.action === "target") {
        state.target = { id: input.id, name: "HaptiLog inbox" };
        body = { saved: true };
      } else throw new Error(`Unexpected action: ${input.action}`);
    } else if (path.endsWith("/recording_correction_history")) body = [];
    else throw new Error(`Unexpected request: ${path}`);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  return state;
}
test("select, batch export, partial failure, explicit retry, reload and disconnect", async ({ page }) => {
  const state = await setup(page);
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Notion export" });
  await panel.getByRole("button", { name: "Notion inbox", exact: false })
    .click();
  await expect(
    panel.getByRole("button", { name: "Send to Notion (0)", exact: true }),
  ).toBeDisabled();
  expect(state.calls.filter((x) => x.action === "export")).toHaveLength(0);
  await panel.getByRole("button", { name: "Select visible", exact: true })
    .click();
  await panel.getByRole("button", { name: "Send to Notion (2)", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText(
    "1 sent, 1 failed, 0 not attempted.",
  );
  state.failSecond = false;
  await panel.getByRole("button", { name: "Retry failed (1)", exact: true })
    .click();
  await expect(panel.getByRole("status")).toHaveText(
    "1 sent, 0 failed, 0 not attempted.",
  );
  expect(
    state.calls.filter((x) => x.action === "export").map((x) => x.recording_id),
  ).toEqual([first, second, second]);
  await page.reload();
  await panel.getByRole("button", { name: "Notion inbox", exact: false })
    .click();
  await expect(panel.getByText(/^Sent ·/)).toHaveCount(2);
  await panel.getByRole("button", { name: "Disconnect Notion", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Connect Notion", exact: true }),
  ).toBeVisible();
  await expect(panel.getByRole("checkbox")).toHaveCount(0);
});
test("OAuth callback is removed from the URL, completed once, and permits target selection", async ({ page }) => {
  const state = await setup(page, { connected: false });
  await page.goto("/?notion=callback&code=temporary-code&state=state-test");
  const panel = page.getByRole("region", { name: "Notion export" });
  await expect(page).toHaveURL("/");
  await expect(panel.getByRole("button", { name: "Choose inbox", exact: true }))
    .toBeVisible();
  expect(state.calls.filter((x) => x.action === "complete")).toEqual([{
    action: "complete",
    code: "temporary-code",
    state: "state-test",
  }]);
  await panel.getByRole("button", { name: "Choose inbox", exact: true })
    .click();
  await panel.getByRole("combobox", { name: "Inbox", exact: true })
    .selectOption("target");
  await panel.getByRole("button", { name: "Use this inbox", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Send to Notion (0)", exact: true }),
  ).toBeVisible();
});
test("unconfigured integration and grant revocation leave recordings independent", async ({ page }) => {
  const state = await setup(page, { configured: false });
  await page.goto("/");
  const panel = page.getByRole("region", { name: "Notion export" });
  await panel.getByRole("button", { name: "Notion inbox", exact: false })
    .click();
  await expect(panel.getByText("Notion is not configured on this server yet."))
    .toBeVisible();
  await expect(
    page.getByRole("region", { name: "Recordings", exact: true }).getByRole(
      "button",
      { name: /First memo/ },
    ),
  ).toBeVisible();
  state.paired = false;
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange"))
  );
  await expect(panel).toHaveCount(0);
});
test("mobile layout keeps selection and send controls accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.goto("/");
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Notion integration" }).click();
  const panel = page.getByRole("region", { name: "Notion export" });
  await panel.getByRole("button", { name: "Notion inbox", exact: false })
    .click();
  await panel.getByRole("checkbox", { name: "First memo", exact: true })
    .check();
  await expect(
    panel.getByRole("button", { name: "Send to Notion (1)", exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth
    ),
  ).toBeTruthy();
});
