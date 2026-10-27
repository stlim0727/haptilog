import { expect } from '@playwright/test';
import { test } from './fixtures';
import { fixture } from './portal-fixture';
import { staysFixture } from './stays-fixture';
for(const width of [1280,390]) {
  test(`demo developer map has isolated GPS and stay samples at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});await page.clock.setFixedTime(new Date('2026-10-27T18:00:00Z'));
    await fixture(page,{connected:false});
    let rawCalls=0;
    await page.route('**/rest/v1/rpc/raw_locations',async route=>{rawCalls++;await route.abort();});
    await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await page.goto('/');await page.getByTestId('preview-test-login-button').click();
    await page.getByRole('button',{name:'Developer continuous location map'}).click();
    const dialog=page.getByRole('dialog',{name:'Developer continuous location map'});
    await expect(dialog.getByLabel('Developer data')).toHaveValue('sample');
    await expect(dialog.getByText(/Synthetic samples/)).toBeVisible();
    const stays=dialog.getByRole('region',{name:'Stays in selected range'});
    await expect(stays.getByRole('button',{name:/Sample stay/})).toHaveCount(4);
    await expect(dialog.locator('.raw-stay-region')).toHaveCount(4);
    await expect(dialog.locator('.raw-stay-dot')).toHaveCount(15); // one boundary falls on the previous day
    await stays.getByRole('button',{name:/Sample stay/}).nth(1).click();
    await expect(dialog.getByRole('region',{name:'Stay source inspector'})).toContainText('observation_gap');
    await expect(dialog.getByRole('button',{name:'Delete all server raw locations'})).toHaveCount(0);
    await dialog.getByRole('slider',{name:'Hourly start'}).fill('12');
    await expect(stays.getByRole('button',{name:/Sample stay/})).toHaveCount(3);
    await dialog.getByRole('slider',{name:'Hourly start'}).fill('14');
    await dialog.getByRole('slider',{name:'Hourly end'}).fill('14');
    await expect(stays.getByRole('button',{name:/Sample stay/})).toHaveCount(0);
    await expect(dialog.locator('.raw-stay-region')).toHaveCount(0);
    await dialog.getByRole('slider',{name:'Hourly end'}).fill('23');
    await dialog.getByRole('slider',{name:'Hourly start'}).fill('0');
    await dialog.evaluate(el=>el.scrollTop=0);
    await dialog.screenshot({path:`test-results/raw-stay-samples-${width}.png`});
    expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    await dialog.getByRole('region',{name:'Continuous raw location map'}).scrollIntoViewIfNeeded();
    await dialog.screenshot({path:`test-results/raw-stay-map-${width}.png`});
    expect(rawCalls).toBe(0);
  });
}
test('real stay summaries remain visible without raw ingestion and samples never mix with them',async({page})=>{
  await staysFixture(page);
  let rawCalls=0;
  await page.route('**/rest/v1/rpc/raw_locations',async route=>{rawCalls++;await route.fulfill({json:{error:'UNAVAILABLE'}});});
  await page.goto('/');await page.getByRole('button',{name:'Developer continuous location map'}).click();
  const dialog=page.getByRole('dialog',{name:'Developer continuous location map'});
  const stays=dialog.getByRole('region',{name:'Stays in selected range'});
  await expect(stays.getByRole('button',{name:/^Stay ·/})).toHaveCount(1);
  await expect(dialog.locator('.raw-stay-region')).toHaveCount(1);
  await dialog.getByLabel('Developer data').selectOption('sample');
  await expect(stays.getByRole('button',{name:/^Stay ·/})).toHaveCount(0);
  await expect(stays.getByRole('button',{name:/Sample stay/})).toHaveCount(4);
  const calls=rawCalls;
  await dialog.getByRole('button',{name:'Refresh fixes'}).click();expect(rawCalls).toBe(calls);
  await dialog.getByLabel('Developer data').selectOption('server');
  await expect(stays.getByRole('button',{name:/^Stay ·/})).toHaveCount(1);
  await expect(stays.getByRole('button',{name:/Sample stay/})).toHaveCount(0);
});
