import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { staysFixture } from "./stays-fixture";
test.use({ timezoneId: "UTC" });

async function openInKorean(page: Page) {
  const { state } = await staysFixture(page);
  await page.addInitScript(() => localStorage.setItem("haptilog_language", "ko"));
  await page.goto("/");
  await page.getByRole("button", { name: "체류와 내 장소", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "체류와 내 장소" });
  await expect(dialog.getByText("Original cafe", { exact: false }).first()).toBeVisible();
  return { state, dialog };
}

test("the stays workspace renders every control in Korean", async ({ page }) => {
  const { dialog } = await openInKorean(page);
  // showModal() moves focus into the dialog, and the localized close control is first.
  expect(await page.evaluate(() => `${document.activeElement?.tagName.toLowerCase()}:${document.activeElement?.textContent?.trim()}`)).toBe("button:닫기");
  await expect(dialog.getByRole("heading", { name: "체류와 내 장소", level: 2 })).toBeVisible();
  await expect(dialog.getByText("워치에서 직접 시작한 위치 기록만 사용합니다.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "장소·체류 동기화", exact: true })).toBeVisible();
  await expect(dialog.getByText("음성 클라우드 동의와 별개입니다.", { exact: false })).toBeVisible();
  await expect(dialog.getByText("워치 적용 대기 · 다음 위치 기록 세션에 적용", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "공통 체류 기준" })).toHaveValue("10");
  await expect(dialog.getByRole("group", { name: "내 장소 (1/20)" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "장소 삭제", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "지도에서 장소 추가", exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "자주 머문 곳", exact: true })).toBeVisible();
  await expect(dialog.getByText("추천할 만큼 확인된 체류가 없습니다.", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("체류 날짜", { exact: false })).toBeVisible();
  const timeline = dialog.getByRole("region", { name: "체류 기록" });
  await expect(timeline.getByText("위치 관측으로 추정한 체류입니다. · UTC", { exact: true })).toBeVisible();
  await expect(timeline.locator("summary")).toContainText("이름 없는 체류");
  await expect(timeline.getByText("최근 관측에서 체류 확인", { exact: true })).toBeHidden();
  await timeline.locator("summary").click();
  await expect(timeline.getByText("Original cafe (현재 장소 설정에 따른 후보)", { exact: true })).toBeVisible();
  await expect(timeline.getByText("음성 연결은 관측 시간·위치에 따른 후보입니다.", { exact: false })).toBeVisible();
  await expect(timeline.getByText("마지막 확인:", { exact: false })).toBeVisible();
  await expect(timeline.getByRole("button", { name: "내 장소로 저장", exact: true })).toBeVisible();
  await expect(timeline.getByRole("button", { name: "이 체류 삭제", exact: true })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "서버 체류 전체 삭제", exact: true })).toBeVisible();
  await expect(dialog.getByText(/Stays and my places|Unnamed stay|Refresh|My places|Stay date|Frequently visited|Delete all server stays/)).toHaveCount(0);
  await page.screenshot({ path: "test-results/stays-korean-workspace.png" });
});

test("the Korean place editor localizes labels, map fallback and actions", async ({ page }) => {
  const { dialog } = await openInKorean(page);
  await dialog.getByRole("button", { name: "편집", exact: true }).click();
  const editor = dialog.locator("form.place-editor");
  await expect(editor.getByRole("region", { name: "장소 영역 지도" })).toBeVisible();
  // staysFixture aborts tile requests, so the Korean map fallback must point at coordinate entry.
  await expect(editor.getByText("지도를 불러오지 못했습니다. 좌표 입력을 사용할 수 있습니다.", { exact: true })).toBeVisible();
  await expect(editor.getByText("지도는 OpenStreetMap에서 불러옵니다.", { exact: false })).toBeVisible();
  for (const label of ["이름", "위도", "경도", "반경 (m)"]) {
    await expect(editor.getByLabel(label, { exact: true })).toBeVisible();
  }
  await expect(editor.getByRole("button", { name: "저장", exact: true })).toBeVisible();
  await expect(editor.getByRole("button", { name: "취소", exact: true })).toBeVisible();
  await expect(editor.getByText(/Name|Latitude|Longitude|Radius \(m\)|Reapply my draft/)).toHaveCount(0);
  await editor.getByLabel("이름", { exact: true }).fill("우리 카페");
  await expect(editor.getByLabel("이름", { exact: true })).toHaveValue("우리 카페");
  await page.screenshot({ path: "test-results/stays-korean-place-editor.png" });
  await editor.getByRole("button", { name: "취소", exact: true }).click();
  await expect(editor).toHaveCount(0);
});

test("Korean deletion confirmation and authorization loss are localized", async ({ page }) => {
  const { state, dialog } = await openInKorean(page);
  await dialog.getByRole("button", { name: "서버 체류 전체 삭제", exact: true }).click();
  const confirm = dialog.getByRole("region", { name: "체류 삭제 확인" });
  await expect(confirm.getByText("선택한 체류를 서버에서 삭제할까요?", { exact: false })).toBeVisible();
  await expect(confirm.getByRole("button", { name: "체류 영구 삭제", exact: true })).toBeVisible();
  await confirm.getByRole("button", { name: "취소", exact: true }).click();
  state.forbidden = true;
  await dialog.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("위치 정보 접근 권한이 만료되었습니다. 워치를 다시 연결하세요.");
  await expect(dialog.getByRole("heading", { name: "장소·체류 동기화", exact: true })).toHaveCount(0);
  await page.screenshot({ path: "test-results/stays-korean-forbidden.png" });
});

test("escape closes the Korean dialog to its trigger and the language switch re-renders it in English", async ({ page }) => {
  const { dialog } = await openInKorean(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // LocationLauncher.close() returns focus to the launcher button.
  expect(await page.evaluate(() => document.activeElement?.textContent?.trim())).toBe("체류와 내 장소");
  await page.getByRole("button", { name: "Toggle language" }).click();
  await page.getByRole("button", { name: "Stays and my places", exact: true }).click();
  const english = page.getByRole("dialog", { name: "Stays and my places" });
  await expect(english.getByRole("heading", { name: "Stays and my places", level: 2 })).toBeVisible();
  await expect(english.getByRole("combobox", { name: "Shared stay threshold" })).toHaveValue("10");
  await expect(english.getByRole("group", { name: "My places (1/20)" })).toBeVisible();
  await expect(english.getByRole("region", { name: "Observed stays" }).locator("summary")).toContainText("Unnamed stay");
  await expect(english.getByRole("button", { name: "Delete all server stays", exact: true })).toBeVisible();
  await expect(english.getByText(/체류와 내 장소|공통 체류 기준|이름 없는 체류|내 장소로 저장|서버 체류 전체 삭제/)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("haptilog_language"))).toBe("en");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  await page.screenshot({ path: "test-results/stays-english-workspace.png" });
});
