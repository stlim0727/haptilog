import { onlyCategory } from "./category-picker";
import { expect } from '@playwright/test';
import { test } from './fixtures';
import { fixture } from './portal-fixture';
for(const width of [1280,390]) {
  test(`main journal mixes sample voices and stays without DEV at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});await page.clock.setFixedTime(new Date('2026-10-27T18:00:00Z'));
    await fixture(page,{connected:false});
    let locationCalls=0;
    await page.route('**/rest/v1/rpc/location_stays',async route=>{locationCalls++;await route.abort();});
    await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
    await page.goto('/');await page.getByTestId('preview-test-login-button').click();
    const stayRows=width<700?5:4; // the midnight stay appears on both observed dates
    // Use visible main cards; neither the developer dialog nor its selector is opened.
    const cards=page.locator(width<700?'.ribbon-stay-open[data-journal-kind="stay"]':'.record-list [data-journal-kind="stay"]');
    await expect(cards).toHaveCount(stayRows);
    await expect(page.locator(width<700?'.mobile-record[data-journal-kind="voice"]':'.record-list [data-journal-kind="voice"]')).toHaveCount(9);
    await expect(cards.filter({hasText:'Sample café'})).toHaveCount(1);
    await expect(page.getByRole('dialog',{name:'Developer continuous location map'})).not.toBeVisible();
    await page.screenshot({path:`test-results/main-stay-samples-${width}.png`,fullPage:true});
    if(width<700) {
      await page.getByRole('button',{name:'Map',exact:true}).click();
      await expect(page.getByRole('region',{name:'Map of voice and stay locations'})).toBeVisible();
      // The map's place list sits above the feed, so its stays must carry the
      // same ribbon grammar rather than the flat card the feed no longer uses.
      await expect(page.locator('.mobile-map-view .ribbon-stay-open').first()).toBeVisible();
      await expect(page.locator('.mobile-map-view .stay-ribbon').first()).toBeAttached();
      await expect(page.locator('.mobile-map-view .mobile-record[data-journal-kind="stay"]')).toHaveCount(0);
      await page.screenshot({path:'test-results/map-stay-ribbons-390.png',fullPage:true});
      // Turn the overlay back off so the feed below is the only card source.
      await page.getByRole('button',{name:'Map',exact:true}).click();
      await expect(page.getByRole('region',{name:'Map of voice and stay locations'})).toHaveCount(0);
    } else {
      const route = page.locator('.journal-route, .journal-route-gap');
      await page.getByRole('button',{name:'Show map',exact:true}).click();
      await expect(page.getByRole('region',{name:'Map of voice and stay locations'})).toBeVisible();
      // Stays share the map, so the route must not depend on a voice-only filter.
      await expect(route.first()).toBeAttached();
      await onlyCategory(page, 'Stays');
      await expect(route.first()).toBeAttached();
      await expect(cards).toHaveCount(stayRows);
      await expect(page.locator('.record-list [data-journal-kind="voice"]')).toHaveCount(0);
    }
    await cards.filter({hasText:'Sample café'}).click();
    const inspector=page.locator('.stay-inspector');
    await expect(inspector).toContainText('60 min observed');
    await expect(inspector).toContainText('Sample stay.');
    await expect(inspector.getByRole('button',{name:'Delete this stay',exact:true})).toHaveCount(0);
    await expect(inspector.getByRole('button',{name:'Save as a place',exact:true})).toHaveCount(0);
    await expect(inspector.getByRole('button',{name:/블루보틀 성수/})).toHaveCount(1);
    if(width<700) await page.getByRole('button',{name:'Back to journal'}).click();
    await page.getByRole('button',{name:'Reset sample data',exact:true}).click();
    await expect(cards).toHaveCount(stayRows);
    await page.reload();await expect(cards).toHaveCount(stayRows);
    expect(locationCalls).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Exit demo',exact:true}).click();
    await expect(cards).toHaveCount(0);
  });
}
