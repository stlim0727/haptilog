import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import { staysFixture } from "./stays-fixture";
test.use({ timezoneId: "UTC" });

async function openInKorean(page: Page) {
  const { state } = await staysFixture(page);
  await page.addInitScript(() => localStorage.setItem("haptilog_language", "ko"));
  await page.goto("/");
  await page.getByRole("button", { name: "더보기", exact: true }).click();
  await page.getByRole("button", { name: "내 장소", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "내 장소", exact: true });
  await expect(dialog.getByText("Original cafe", { exact: false }).first()).toBeVisible();
  return { state, dialog };
}

test("the unified journal settings and stay details render in Korean", async ({ page }) => {
  const { dialog } = await openInKorean(page);
  await expect(dialog.getByRole("button", { name: "닫기", exact: true })).toBeFocused();
  await expect(dialog.getByRole("heading", { name: "내 장소", exact: true })).toBeVisible();
  await dialog.locator(".place-settings-section > summary").filter({hasText:"동기화 및 체류 설정"}).click();
  await expect(dialog.getByRole("heading", { name: "웹에도 표시", exact: true })).toBeVisible();
  await dialog.getByText("동기화 자세히 보기", {exact:true}).click();
  await expect(dialog.getByText("음성 클라우드 동의와 별개입니다.", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "공통 체류 기준" })).toHaveValue("10");
  await expect(dialog.getByRole("group", { name: "내 장소 (1/20)" })).toBeVisible();
  await expect(dialog.locator(".saved-place-row")).toHaveCount(1);
  await dialog.getByText("데이터 관리", {exact:true}).click();
  await expect(dialog.getByRole("button", { name: "서버 체류 전체 삭제", exact: true })).toBeVisible();
  await expect(dialog.getByText(/Place settings|Shared stay threshold|My places|Frequently visited/)).toHaveCount(0);
  // Stays have one home: the common journal, not a second timeline in this dialog.
  await expect(dialog.getByRole("region", { name: "체류 기록" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await page.locator('.record-list [data-journal-kind="stay"]').click();
  const detail = page.locator(".inspector");
  await expect(detail).toContainText("확인된 체류 59분");
  await expect(detail).toContainText("현재 장소 설정 기준");
  // Naming happens inline in the journal, and this stay already resolves to a saved place.
  await expect(detail.getByRole("button", { name: "이름 수정", exact: true })).toBeVisible();
  await expect(detail.getByRole("button", { name: "장소로 저장", exact: true })).toHaveCount(0);
  await expect(detail.getByRole("button", { name: "이 체류 삭제", exact: true })).toBeVisible();
  await expect(detail.getByText(/First observed|Last confirmed|No unambiguous voice candidates/)).toHaveCount(0);
  await page.screenshot({ path: "test-results/stays-korean-workspace.png" });
});

test("the Korean place editor localizes labels, map fallback and actions", async ({ page }) => {
  const { dialog } = await openInKorean(page);
  await dialog.getByRole("button", { name: "편집", exact: true }).click();
  const editor = dialog.locator("form.place-editor");
  await expect(editor.getByLabel("이름", {exact:true})).toBeVisible();
  await expect(editor.getByRole("region", { name: "장소 영역 지도" })).toHaveCount(0);
  await editor.getByText("위치 조정", {exact:true}).click();
  await expect(editor.getByRole("region", { name: "장소 영역 지도" })).toBeVisible();
  await expect(editor.getByText("지도를 불러오지 못했습니다. 좌표 입력을 사용할 수 있습니다.", { exact: true })).toBeVisible();
  for (const label of ["이름", "위도", "경도", "반경 (m)"]) await expect(editor.getByLabel(label, { exact: true })).toBeVisible();
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
  await dialog.getByText("데이터 관리", {exact:true}).click();
  await dialog.getByRole("button", { name: "서버 체류 전체 삭제", exact: true }).click();
  const confirm = dialog.getByRole("region", { name: "체류 삭제 확인" });
  await expect(confirm.getByText("선택한 체류를 서버에서 삭제할까요?", { exact: false })).toBeVisible();
  await expect(confirm.getByRole("button", { name: "체류 영구 삭제", exact: true })).toBeVisible();
  await confirm.getByRole("button", { name: "취소", exact: true }).click();
  state.forbidden = true;
  await dialog.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveText("위치 정보 접근 권한이 만료되었습니다. 워치를 다시 연결하세요.");
  await expect(dialog.getByRole("heading", { name: "웹에도 표시", exact: true })).toHaveCount(0);
});

test("escape returns focus and the language switch updates the unified settings", async ({ page }) => {
  const { dialog } = await openInKorean(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "더보기", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Toggle language" }).click();
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("button", { name: "My places", exact: true }).click();
  const english = page.getByRole("dialog", { name: "My places", exact: true });
  await expect(english.getByRole("heading", { name: "My places", exact: true })).toBeVisible();
  await english.getByText("Sync and stays", {exact:true}).click();
  await expect(english.getByRole("combobox", { name: "Shared stay threshold" })).toHaveValue("10");
  await expect(english.getByRole("group", { name: "My places (1/20)" })).toBeVisible();
  await expect(english.getByText(/장소 설정|공통 체류 기준|서버 체류 전체 삭제/)).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  expect(await page.evaluate(() => localStorage.getItem("haptilog_language"))).toBe("en");
});
