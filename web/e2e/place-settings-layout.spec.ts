import { expect } from '@playwright/test';
import { test } from './fixtures';
import { staysFixture, openStays } from './stays-fixture';
for(const width of [1280,390]) for(const theme of ['dark','light']) {
  test(`place settings prioritize names and hide advanced controls at ${width}px ${theme}`,async({page})=>{
    await page.setViewportSize({width,height:844});
    const {state}=await staysFixture(page);
    await page.addInitScript(value=>localStorage.setItem('haptilog_theme',value),theme);
    const dialog=await openStays(page);
    await expect(dialog.getByRole('heading',{name:'My places',exact:true})).toBeVisible();
    await expect(dialog.locator('.saved-place-row')).toHaveCount(1);
    await expect(dialog.getByRole('combobox',{name:'Shared stay threshold'})).not.toBeVisible();
    await expect(dialog.getByRole('button',{name:'Delete all server stays'})).not.toBeVisible();
    await expect(dialog.getByText('About synchronization',{exact:true})).not.toBeVisible();
    await dialog.screenshot({path:`test-results/place-settings-${width}-${theme}.png`,animations:'disabled'});
    await dialog.getByRole('button',{name:'Edit',exact:true}).click();
    const editor=dialog.locator('.place-editor');
    await expect(editor.getByLabel('Name',{exact:true})).toBeFocused();
    await expect(editor.locator('input')).toHaveCount(1);
    await expect(editor.getByRole('region',{name:'Place area map'})).toHaveCount(0);
    await editor.getByLabel('Name',{exact:true}).fill('My company');
    await dialog.screenshot({path:`test-results/place-settings-name-${width}-${theme}.png`,animations:'disabled'});
    await editor.getByRole('button',{name:'Save',exact:true}).click();
    await expect(dialog.locator('.saved-place-row')).toContainText('My company');
    expect(state.puts[0]).toMatchObject({latitude:37.5,longitude:127,radius_meters:200});
    expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    expect((await dialog.boundingBox())!.height).toBeLessThan(700);
  });
}
