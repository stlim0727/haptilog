import { expect } from '@playwright/test';
import { test } from './fixtures';
import { fixture } from './portal-fixture';
for (const width of [1280,390]) {
  test(`daily/hourly dots select only matching map fixes at ${width}px`, async({page})=>{
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({width,height:844});
    await page.clock.setFixedTime(new Date('2026-10-27T18:00:00Z'));
    await fixture(page);
    const readings=[
      ['day-before','2026-10-26T10:10:00Z'],['morning','2026-10-27T09:15:00Z'],
      ['noon','2026-10-27T12:00:00Z'],['evening','2026-10-27T18:30:00Z'],
    ].map(([id,time],i)=>({id,session_id:'session',sequence:i+1,observed_at:time,elapsed_realtime_millis:1000+i*60000,
      latitude:37.5+i*.01,longitude:127,accuracy_meters:10,fix_age_millis:0,clock_discontinuity:false}));
    await page.route('**/rest/v1/rpc/raw_locations',async route=>{
      const {p_payload:p}=route.request().postDataJSON();
      await route.fulfill({json:{protocol_version:1,has_more:false,sync_epoch:0,consent_enabled:true,
        samples:readings.filter(s=>Date.parse(s.observed_at)>=Date.parse(p.from)&&Date.parse(s.observed_at)<Date.parse(p.to))}});
    });
    await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await page.goto('/');await page.locator('.account-trigger-btn').click();await page.getByRole('button',{name:'Developer continuous location map'}).click();
    const dialog=page.getByRole('dialog');
    const stats=dialog.getByRole('status').filter({hasText:'fixes ·'});
    await expect(stats).toContainText('3 / 4 fixes');
    await expect(dialog.locator('.raw-timeline-level').first().locator('.raw-observation-dot')).toHaveCount(4);
    await expect(dialog.getByLabel('Select fix').locator('option')).toHaveCount(3);
    // Keyboard range controls filter both map and inspector; end boundary is exclusive.
    const hourStart=dialog.getByRole('slider',{name:'Hourly start'}),hourEnd=dialog.getByRole('slider',{name:'Hourly end'});
    await hourStart.fill('12');await hourEnd.fill('12');
    await expect(stats).toContainText('1 / 4 fixes');
    await expect(dialog.getByLabel('Select fix')).toHaveValue('noon');
    await expect(dialog.locator('.raw-location-map .leaflet-overlay-pane path')).toHaveCount(3);
    await hourStart.focus();await page.keyboard.press('ArrowRight');
    await expect(stats).toContainText('0 / 4 fixes');await expect(dialog).toContainText('No fixes in the selected time range');
    await expect(dialog.locator('.raw-location-map')).toHaveCount(0);
    // Day range expands the second tier, including both selected days on the map.
    await dialog.getByRole('slider',{name:'Daily start'}).fill('5');
    await expect(stats).toContainText('4 / 4 fixes');
    await expect(hourEnd).toHaveAttribute('max','47');
    await dialog.getByRole('slider',{name:'Daily end'}).fill('5');
    await expect(stats).toContainText('1 / 4 fixes');await expect(dialog.getByLabel('Select fix')).toHaveValue('day-before');
    // Mouse brush in the hourly dot strip selects a contiguous range.
    const rail=dialog.getByRole('img',{name:'Hourly observation dot timeline'});
    await rail.scrollIntoViewIfNeeded();
    await rail.evaluate(el => { el.closest('.raw-dot-scroll')!.scrollLeft = 8 * 48; });
    const box=(await rail.boundingBox())!;
    await page.mouse.move(box.x+box.width/24*9.1,box.y+30);await page.mouse.down();
    await page.mouse.move(box.x+box.width/24*10.9,box.y+30);await page.mouse.up();
    await expect(hourStart).toHaveValue('9');await expect(hourEnd).toHaveValue('10');
    await expect(stats).toContainText('1 / 4 fixes');
    await dialog.evaluate(el=>el.scrollTop=0);
    await page.screenshot({path:`test-results/raw-timeline-${width}.png`,fullPage:true});
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}
