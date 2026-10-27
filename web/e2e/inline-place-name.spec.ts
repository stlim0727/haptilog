import { expect } from '@playwright/test';
import { test } from './fixtures';
import { staysFixture } from './stays-fixture';
for(const width of [1280,390]) {
  test(`name a stay inline without opening settings at ${width}px`, async({page})=>{
    await page.setViewportSize({width,height:844});
    const {state}=await staysFixture(page);
    state.data.places=[];
    const source=JSON.stringify(state.data.stays);
    await page.goto('/',{waitUntil:'domcontentloaded'});
    const timeline=page.locator('.journal-ribbons');
    await timeline.getByRole('button',{name:'+ Save place',exact:true}).click();
    const form=timeline.getByRole('form',{name:'Name this place'});
    await expect(form.locator('input')).toHaveCount(1);
    await expect(form.getByLabel('Place name')).toBeFocused();
    await expect(form.getByRole('button',{name:'Save',exact:true})).toBeDisabled();
    await form.getByLabel('Place name').fill('Company');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await timeline.first().screenshot({path:`test-results/inline-place-name-${width}.png`,animations:'disabled',timeout:10000});
    await form.getByRole('button',{name:'Save',exact:true}).click();
    await expect(timeline.locator('.ribbon-stay-open')).toContainText('Company');
    expect(state.puts).toHaveLength(1);
    expect(state.puts[0]).toMatchObject({name:'Company',latitude:37.5,longitude:127,radius_meters:200,expected_revision:4});
    expect(JSON.stringify(state.data.stays)).toBe(source);
    await timeline.getByRole('button',{name:'Rename place',exact:true}).click();
    await expect(form.getByLabel('Place name')).toHaveValue('Company');
    await form.getByRole('button',{name:'Cancel',exact:true}).click();
    await expect(timeline.getByRole('button',{name:'Rename place',exact:true})).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
test('inline rename preserves geometry and draft through conflicts and explicit review',async({page})=>{
  const {state}=await staysFixture(page);
  state.data.places[0].radius_meters=350;
  state.conflictNext=true;
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const timeline=page.locator('.journal-ribbons');
  await timeline.getByRole('button',{name:'Rename place',exact:true}).click();
  const form=timeline.getByRole('form',{name:'Name this place'});
  await form.getByLabel('Place name').fill('My company');
  await form.getByRole('button',{name:'Save',exact:true}).click();
  await expect(form.getByRole('alert')).toContainText('Places changed');
  await expect(form.getByLabel('Place name')).toHaveValue('My company');
  await expect(form.getByRole('button',{name:'Save',exact:true})).toBeDisabled();
  await form.getByRole('button',{name:'Review latest places',exact:true}).click();
  await expect(form.getByRole('status')).toContainText('Updated on another device');
  await form.getByRole('button',{name:'Save',exact:true}).click();
  await expect(timeline.locator('.ribbon-stay-open')).toContainText('My company');
  expect(state.puts[1]).toMatchObject({id:'22222222-2222-4222-8222-222222222222',latitude:37.5,longitude:127,radius_meters:350,expected_revision:5});
});
test('inline save retains the name after a network failure',async({page})=>{
  const {state}=await staysFixture(page);state.data.places=[];
  let fail=true;
  await page.route('**/rest/v1/rpc/location_stays',async route=>{
    if(fail&&route.request().postDataJSON().p_action==='put_place') {fail=false;await route.fulfill({status:503,json:{code:'NETWORK'}});} else await route.fallback();
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const timeline=page.locator('.journal-ribbons');
  await timeline.getByRole('button',{name:'+ Save place',exact:true}).click();
  const form=timeline.getByRole('form',{name:'Name this place'});
  await form.getByLabel('Place name').fill('Home');
  await form.getByRole('button',{name:'Save',exact:true}).click();
  await expect(form.getByRole('alert')).toContainText('Your name is preserved');
  await expect(form.getByLabel('Place name')).toHaveValue('Home');
  await form.getByRole('button',{name:'Save',exact:true}).click();
  await expect(timeline.locator('.ribbon-stay-open')).toContainText('Home');
});
test('acknowledged name remains visible if refreshing the journal fails',async({page})=>{
  const {state}=await staysFixture(page);state.data.places=[];
  await page.route('**/rest/v1/rpc/location_stays',async route=>{
    if(route.request().postDataJSON().p_action==='snapshot'&&state.puts.length>0) await route.fulfill({status:503,json:{code:'NETWORK'}});
    else await route.fallback();
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const timeline=page.locator('.journal-ribbons');
  await timeline.getByRole('button',{name:'+ Save place',exact:true}).click();
  const form=timeline.getByRole('form',{name:'Name this place'});
  await form.getByLabel('Place name').fill('Saved home');
  await form.getByRole('button',{name:'Save',exact:true}).click();
  await expect(timeline.locator('.ribbon-stay-open')).toContainText('Saved home');
  await expect(timeline.getByRole('form',{name:'Name this place'})).toHaveCount(0);
  expect(state.puts).toHaveLength(1);
});
