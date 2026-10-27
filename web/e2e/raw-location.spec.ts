import { expect } from '@playwright/test';
import { test } from './fixtures';
import { fixture } from './portal-fixture';
for (const width of [1280,390]) {
  test(`continuous raw trail and gaps at ${width}px`, async ({page})=>{
    await page.setViewportSize({width,height:844});await fixture(page);
    let deleted=false;
    await page.route('**/rest/v1/rpc/raw_locations',async route=>{
      const input=route.request().postDataJSON();let body: unknown;
      if(input.p_action==='read') body={protocol_version:1,has_more:false,sync_epoch:0,consent_enabled:true,samples:deleted?[]:[0,1,2].map(i=>({
        id:`fix-${i}`,session_id:'capture-session',sequence:i===2?4:i+1,observed_at:`2026-10-27T12:0${i}:00Z`,
        elapsed_realtime_millis:1000+i*60000,fix_age_millis:0,latitude:37.5+i*.001,longitude:127,accuracy_meters:i?8:800,
        clock_discontinuity:false,...(i===0?{speed:0}:{}),
      }))};
      else if(input.p_action==='status') body={protocol_version:1,sync_epoch:0};
      else {deleted=true;body={sync_epoch:1};}
      await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
    });
    await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await page.goto('/');await page.getByRole('button',{name:'Developer continuous location map'}).click();
    const dialog=page.getByRole('dialog',{name:'Developer continuous location map'});
    await expect(dialog.getByRole('status').filter({ hasText: 'fixes ·' })).toContainText('3 / 3 fixes · 2 segments');
    await expect(dialog.getByRole('region',{name:'Continuous raw location map'})).toBeVisible();
    await expect(dialog.locator('.leaflet-overlay-pane path')).toHaveCount(6); // line + three fixes + selected circle/highlight
    const lineToggle=dialog.getByRole('button',{name:'Chronological connection line'});
    await expect(lineToggle).toHaveAttribute('aria-pressed','true');
    await expect(dialog.locator('.raw-connection-line')).toHaveCount(1);
    const chosen=await dialog.getByLabel('Select fix').inputValue();
    await lineToggle.click();
    await expect(lineToggle).toHaveAttribute('aria-pressed','false');
    await expect(dialog.locator('.raw-connection-line')).toHaveCount(0);
    await expect(dialog.locator('.leaflet-overlay-pane path')).toHaveCount(5);
    await expect(dialog.getByLabel('Select fix')).toHaveValue(chosen);
    await lineToggle.focus();await page.keyboard.press('Enter');
    await expect(lineToggle).toHaveAttribute('aria-pressed','true');
    await expect(dialog.locator('.raw-connection-line')).toHaveCount(1);
    const inspector=dialog.getByRole('region',{name:'Raw fix inspector'});
    await expect(inspector).toContainText('800');await expect(inspector).toContainText('Not collected');
    await dialog.getByRole('button',{name:'Next fix'}).click();await expect(dialog.getByLabel('Select fix')).toHaveValue('fix-1');
    await dialog.evaluate(el => el.scrollTop = 0);
    await page.screenshot({path:`test-results/raw-location-${width}.png`,fullPage:true});
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await dialog.getByRole('button',{name:'Delete all server raw locations'}).click();
    await expect(dialog).toContainText('No synchronized continuous locations');
    await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(dialog).not.toBeVisible();
  });
}
