// Captures the HaptiLog web portal UI screens showcase.
// Mirrors the flight3d "UI Screens" flow: tiered capture (core/full/all),
// --verify dry-run into a temp dir, catalog.json with bilingual metadata.
// All backend traffic is served by the deterministic e2e fixture (mocked
// Supabase + demo sample data), so no live credentials are required.
//
// Usage (from web/):
//   node --experimental-strip-types scripts/capture-all-ui-screens.mjs [--tier core|full|all] [--verify] [--viewport desktop|mobile-portrait|mobile-landscape]
import assert from 'node:assert/strict';
import { execSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromium } from '@playwright/test';
import { fixture } from '../e2e/portal-fixture.ts';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const isVerify =
  process.argv.includes('--verify') ||
  process.env.npm_lifecycle_event === 'test:ui-screens';
const isLowResource = isVerify;

const tierArg = process.argv.find(
  (arg) => arg.startsWith('--tier=') || arg === '--tier',
);
const tier = tierArg
  ? tierArg.includes('=')
    ? tierArg.split('=')[1]
    : process.argv[process.argv.indexOf('--tier') + 1]
  : 'all';
if (!['core', 'full', 'all'].includes(tier)) {
  throw new Error(`Unknown tier: ${tier}. Available: core, full, all`);
}

export const VIEWPORT_DEFINITIONS = {
  desktop: {
    id: 'desktop',
    name: 'Desktop (1440×900)',
    width: isLowResource ? 1280 : 1440,
    height: isLowResource ? 720 : 900,
    mobile: false,
    deviceScaleFactor: 1,
    defaultOutDir: 'public/screenshots/ui',
  },
  'mobile-portrait': {
    id: 'mobile-portrait',
    name: 'Mobile Portrait (390×844)',
    width: 390,
    height: 844,
    mobile: true,
    deviceScaleFactor: 2,
    defaultOutDir: 'public/screenshots/ui-mobile-portrait',
  },
  'mobile-landscape': {
    id: 'mobile-landscape',
    name: 'Mobile Landscape (844×390)',
    width: 844,
    height: 390,
    mobile: true,
    deviceScaleFactor: 2,
    defaultOutDir: 'public/screenshots/ui-mobile-landscape',
  },
};

const viewportArg = process.argv.find(
  (arg) => arg.startsWith('--viewport=') || arg === '--viewport',
);
const selectedViewportKeys = viewportArg
  ? [
      (viewportArg.includes('=')
        ? viewportArg.split('=')[1]
        : process.argv[process.argv.indexOf('--viewport') + 1]
      ).trim(),
    ]
  : ['desktop'];

const selectedViewports = selectedViewportKeys.map((key) => {
  const cfg = VIEWPORT_DEFINITIONS[key];
  if (!cfg) {
    throw new Error(
      `Unknown viewport: ${key}. Available: desktop, mobile-portrait, mobile-landscape`,
    );
  }
  return cfg;
});

function getFreePort() {
  return new Promise((res, rej) => {
    const srv = createServer();
    srv.unref(0);
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
  });
}

async function openSession(origin, vpConfig, mockOpts, demo) {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: vpConfig.width, height: vpConfig.height },
    deviceScaleFactor: vpConfig.deviceScaleFactor,
    isMobile: vpConfig.mobile,
    hasTouch: vpConfig.mobile,
  });
  const page = await context.newPage();
  const exceptions = [];
  page.on('pageerror', (err) => exceptions.push(String(err)));
  await fixture(page, mockOpts ?? {});
  await page.goto(`${origin}/`);
  if (demo) {
    await page.getByTestId('preview-test-login-button').click();
    await page
      .getByRole('status', { name: 'Demo mode notice' })
      .waitFor({ timeout: 15000 });
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  return { browser, page, exceptions };
}

// One browser session per screen-group keeps fixture state independent.
async function recordScreens(vpConfig, origin, tierAllowed, recordScreen) {
  // --- Session: pairing screen (fresh browser, no stored session) ---------
  if (tierAllowed.includes('core')) {
    const { browser, page, exceptions } = await openSession(origin, vpConfig, {
      connected: false,
    });
    await page.locator('.pair-card').waitFor({ timeout: 15000 });
    await page.locator('#code').fill('123456');
    await delay(400);
    await recordScreen(page, {
      id: '01_pairing_login',
      category: 'auth',
      file: '01_pairing_login.png',
      title_ko: '로그인 — 워치 연결 코드 입력',
      title_en: 'Sign-in — Watch Access Code',
      description_ko: '구글 로그인 또는 6자리 워치 액세스 코드로 브라우저 연결, 미리보기용 샘플 데이터 로그인 카드',
      description_en: 'Browser pairing via Google sign-in or 6-digit watch access code, plus the preview sample-data login card',
      selector: '.pair-card',
      tier: 'core',
    });
    await browser.close();
    assert.equal(exceptions.length, 0, `Uncaught browser exceptions (pairing): ${exceptions.join('; ')}`);
  }

  // --- Session: workspace captured in demo mode (sample recordings) -------
  if (tierAllowed.length) {
    const { browser, page, exceptions } = await openSession(
      origin,
      vpConfig,
      { connected: false },
      /* demo */ true,
    );
    await page.locator('.record-card').first().waitFor({ timeout: 15000 });

    if (tierAllowed.includes('core')) {
      await page
        .locator('.record-card', { hasText: '블루보틀' })
        .first()
        .click();
      await delay(600);
      await recordScreen(page, {
        id: '02_workspace_list_detail',
        category: 'workspace',
        file: '02_workspace_list_detail.png',
        title_ko: '데스크톱 작업대 — 타임라인 저널과 상세 인스펙터',
        title_en: 'Desktop Workspace — Journal Timeline & Inspector',
        description_ko: '지출 요약·녹음 메트릭·카테고리 탭과 선택한 녹음의 전사·GPS·AI 분류 상세 인스펙터',
        description_en: 'Spending metrics, category tabs, and the detail inspector of the selected recording with transcript, GPS context, and AI classification',
        selector: '.workspace',
        scrollTo: '.review-layout',
        tier: 'core',
      });
    }

    if (tierAllowed.includes('core')) {
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      await page.locator('.map-section .leaflet-container').waitFor({ timeout: 20000 });
      await delay(2500); // let OSM tiles settle
      await recordScreen(page, {
        id: '03_timeline_map',
        category: 'workspace',
        file: '03_timeline_map.png',
        title_ko: '타임라인 저널과 지도 패널',
        title_en: 'Journal Timeline with Map Panel',
        description_ko: '체류 리본과 음성 이벤트가 있는 타임라인 저널, OpenStreetMap 위에 녹음 핀과 경로',
        description_en: 'Journal timeline with stay ribbons and voice events, plus recording pins and routes on OpenStreetMap',
        selector: '.map-section',
        scrollTo: '.map-section',
        tier: 'core',
      });
      await page.getByRole('button', { name: 'Map', exact: true }).click();
      await delay(400);
    }

    if (tierAllowed.includes('core')) {
      await page.getByRole('button', { name: 'Account & watches', exact: true }).click();
      await page.locator('.account-dropdown-panel').waitFor({ timeout: 10000 });
      await delay(400);
      await recordScreen(page, {
        id: '04_account_panel',
        category: 'auth',
        file: '04_account_panel.png',
        title_ko: '계정 및 워치 드롭다운 패널',
        title_en: 'Account & Watches Dropdown Panel',
        description_ko: '연결된 워치 목록, 브라우저 해제, 구글 계정 연결/복구 컨트롤',
        description_en: 'Paired watch list, disconnect, and Google account link/recovery controls',
        selector: '.account-dropdown-panel',
        tier: 'core',
      });
      await page.getByRole('button', { name: 'Account & watches', exact: true }).click();
      await page.locator('.account-dropdown-panel').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    }

    if (tierAllowed.includes('full')) {
      await page
        .getByRole('tab', { name: 'Calendar', exact: false })
        .click();
      await delay(1200);
      await recordScreen(page, {
        id: '05_calendar_view',
        category: 'workspace',
        file: '05_calendar_view.png',
        title_ko: '월간 캘린더 — 카테고리 도트 브라우징',
        title_en: 'Monthly Calendar — Category Dot Browsing',
        description_ko: '일별 활동 요약과 카테고리 색상 도트가 있는 달력 뷰, 날짜 선택 시 목록 필터',
        description_en: 'Calendar grid with per-day activity and category color dots; selecting a day filters the feed',
        selector: '.workspace',
        scrollTo: '.calendar-view-container',
        tier: 'full',
      });
      await page.getByRole('tab', { name: 'Timeline', exact: false }).click();
      await delay(400);

      await page.locator('.tabs button.trash-tab').click();
      await delay(700);
      await recordScreen(page, {
        id: '06_trash_view',
        category: 'workspace',
        file: '06_trash_view.png',
        title_ko: '휴지통 — 삭제된 녹음 복원/완전 삭제',
        title_en: 'Trash — Restore & Purge Deleted Recordings',
        description_ko: '휴지통 탭의 삭제된 녹음 목록, 복원 버튼과 휴지통 비우기',
        description_en: 'Trashed recordings list with restore actions and empty-trash control',
        selector: '.feed',
        scrollTo: '.feed',
        tier: 'full',
      });
      await page.locator('.tabs button', { hasText: 'All' }).first().click();
      await delay(400);

      await page.locator('.tabs button', { hasText: 'Expense' }).click();
      await page.locator('.search').fill('라떼');
      await delay(700);
      await recordScreen(page, {
        id: '07_category_search',
        category: 'workspace',
        file: '07_category_search.png',
        title_ko: '카테고리 필터와 전사 검색',
        title_en: 'Category Filter & Transcript Search',
        description_ko: '지출 카테고리와 검색어로 녹음 목록을 좁히는 작업대 필터',
        description_en: 'Workbench narrowing by expense category and transcript keyword search',
        selector: '.global-filters-bar',
        scrollTo: '.review-layout',
        tier: 'full',
      });
      await page.locator('.search').fill('');
      await page.locator('.tabs button', { hasText: 'All' }).first().click();
      await delay(400);

      await page.getByRole('button', { name: 'Toggle language' }).click();
      await delay(700);
      await recordScreen(page, {
        id: '08_workspace_ko',
        category: 'workspace',
        file: '08_workspace_ko.png',
        title_ko: '작업대 — 한국어 UI',
        title_en: 'Workspace — Korean UI',
        description_ko: '한국어 전체 로케일: 지출 메트릭, 필터, 상세 인스펙터',
        description_en: 'Full Korean locale: spending metrics, filters, and the detail inspector',
        selector: '.workspace',
        scrollTo: '.review-layout',
        tier: 'full',
      });
    }

    if (tierAllowed.includes('all')) {
      await page.getByRole('button', { name: 'Toggle language' }).click();
      await delay(500);
      await page.getByRole('button', { name: 'More options' }).click();
      await page.locator('dialog.journal-more-dialog[open]').waitFor({ timeout: 5000 });
      await page.getByRole('button', { name: 'Export voice to Notion' }).click();
      await page
        .locator('#desktop-notion-export')
        .waitFor({ timeout: 10000 });
      await delay(900);
      await recordScreen(page, {
        id: '09_notion_export',
        category: 'workspace',
        file: '09_notion_export.png',
        title_ko: 'Notion 내보내기 패널',
        title_en: 'Notion Export Panel',
        description_ko: '선택 기간의 녹음을 Notion 데이터베이스로 내보내는 구성·실행 패널',
        description_en: 'Configure and run Notion database exports for the selected recordings',
        selector: '#desktop-notion-export',
        scrollTo: '#desktop-notion-export',
        tier: 'all',
      });
      await page.getByRole('button', { name: 'More options' }).click();
      await page.getByRole('button', { name: 'Export voice to Notion' }).click();
      await delay(300);
    }

    await browser.close();
    assert.equal(exceptions.length, 0, `Uncaught browser exceptions (workspace): ${exceptions.join('; ')}`);
  }

  // --- Session: enrichment-failure detail (mocked backend fixture) --------
  if (tierAllowed.includes('all')) {
    const { browser, page, exceptions } = await openSession(
      origin,
      vpConfig,
      { connected: true, failed: true },
    );
    await page.locator('.record-card').first().waitFor({ timeout: 15000 });
    await page.locator('.record-card').first().click();
    await delay(600);
    await recordScreen(page, {
      id: '10_enrichment_failed',
      category: 'workspace',
      file: '10_enrichment_failed.png',
      title_ko: 'AI 분석 실패 상태와 재시도',
      title_en: 'AI Enrichment Failure & Retry',
      description_ko: '제공자 실패 후 실패 배지와 재시도 버튼, 원본 음성·메타데이터 보존 안내',
      description_en: 'Provider-failure badge with retry control after AI parsing fails; original audio and metadata remain intact',
      selector: '.inspector',
      scrollTo: '.inspector',
      tier: 'all',
    });
    await browser.close();
    assert.equal(exceptions.length, 0, `Uncaught browser exceptions (failure state): ${exceptions.join('; ')}`);
  }
}

async function captureViewport(vpConfig, origin, tier, isVerify) {
  const outDir = isVerify
    ? await mkdtemp(join(tmpdir(), `haptilog-ui-screens-${vpConfig.id}-`))
    : process.env.UI_SCREENSHOTS_DIR && selectedViewports.length === 1
      ? resolve(process.cwd(), process.env.UI_SCREENSHOTS_DIR)
      : resolve(process.cwd(), vpConfig.defaultOutDir);

  await mkdir(outDir, { recursive: true });
  console.log(
    `[capture-all-ui-screens][${vpConfig.id}] Target: ${outDir} (${vpConfig.width}x${vpConfig.height}, tier: ${tier})`,
  );

  const tierAllowed = { core: ['core'], full: ['core', 'full'], all: ['core', 'full', 'all'] }[tier];
  const catalog = [];
  async function recordScreen(page, meta) {
    const filePath = join(outDir, meta.file);
    if (meta.scrollTo) {
      await page
        .locator(meta.scrollTo)
        .first()
        .evaluate((el) => el.scrollIntoView({ block: "start" }))
        .catch(() => {});
    } else {
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    await delay(300);
    await page.screenshot({ path: filePath });
    catalog.push(meta);
    console.log(`✓ [${vpConfig.id}][${meta.id}] ${meta.title_ko} (${meta.file})`);
  }

  await recordScreens(vpConfig, origin, tierAllowed, recordScreen);

  let finalCatalog = catalog;
  let previousMeta = {};
  if (tier !== 'all') {
    try {
      const existing = JSON.parse(await readFile(join(outDir, 'catalog.json'), 'utf8'));
      const existingScreens = Array.isArray(existing) ? existing : existing.screens || [];
      if (!Array.isArray(existing)) {
        previousMeta = {
          generatedAt: existing.generatedAt,
          branch: existing.branch,
          commit: existing.commit,
          commitShort: existing.commitShort,
          commitDate: existing.commitDate,
        };
      }
      if (Array.isArray(existingScreens)) {
        const capturedMap = new Map(catalog.map((c) => [c.id, c]));
        finalCatalog = existingScreens.map((item) => capturedMap.get(item.id) || item);
        for (const item of catalog) {
          if (!existingScreens.some((e) => e.id === item.id)) finalCatalog.push(item);
        }
      }
    } catch {}
  }

  finalCatalog.sort((a, b) => a.id.localeCompare(b.id));

  let gitBranch = process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || previousMeta.branch || '';
  let gitCommit = process.env.GITHUB_SHA || previousMeta.commit || '';
  let gitCommitDate = previousMeta.commitDate || '';
  const git = (cmd) => {
    try {
      return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return '';
    }
  };
  if (!gitBranch) gitBranch = git('git rev-parse --abbrev-ref HEAD');
  if (!gitCommit) gitCommit = git('git rev-parse HEAD');
  if (!gitCommitDate) gitCommitDate = git('git log -1 --format=%cI');

  const catalogPayload = {
    generatedAt: new Date().toISOString(),
    branch: gitBranch || 'unknown',
    commit: gitCommit || 'unknown',
    commitShort: gitCommit ? gitCommit.slice(0, 7) : 'unknown',
    commitDate: gitCommitDate || 'unknown',
    surface: 'web-portal',
    viewport: vpConfig.id,
    dimensions: `${vpConfig.width}x${vpConfig.height}`,
    screens: finalCatalog,
  };
  await writeFile(join(outDir, 'catalog.json'), JSON.stringify(catalogPayload, null, 2));
  console.log(
    `[capture-all-ui-screens][${vpConfig.id}] Complete. ${catalog.length} screens captured (${finalCatalog.length} in catalog).`,
  );
  if (isVerify) {
    console.log(`[capture-all-ui-screens][${vpConfig.id}] Verify mode: output kept at ${outDir} for artifact upload.`);
  }
}

// ---- shared Vite dev server (test-mocked Supabase origin) -----------------
const vitePort = await getFreePort();
const origin = `http://127.0.0.1:${vitePort}`;
const viteProc = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'], {
  stdio: 'ignore',
  windowsHide: true,
  env: {
    ...process.env,
    VITE_SUPABASE_URL: 'https://haptilog-test.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only',
  },
});

for (let i = 0; i < 100; i++) {
  try {
    const res = await fetch(origin);
    if (res.ok) break;
  } catch {}
  await delay(100);
}

try {
  console.log(
    `[capture-all-ui-screens] Shared Vite server ready at ${origin}. Launching ${selectedViewports.length} viewport(s).`,
  );
  for (const vp of selectedViewports) {
    await captureViewport(vp, origin, tier, isVerify);
  }
} finally {
  try {
    viteProc.kill('SIGTERM');
  } catch {}
}
