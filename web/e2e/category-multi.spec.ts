import { expect } from '@playwright/test';
import { test } from './fixtures';
import { fixture } from './portal-fixture';
for (const width of [1280, 390]) {
  test(`all selects every filter chip and individual types can be excluded at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:844});
    await fixture(page,{connected:false});
    await page.goto('/'); await page.getByTestId('preview-test-login-button').click();
    const mobile=width<700;
    const picker=mobile?page.locator('.category-chip-picker'):page.getByRole('group',{name:'Recording category'});
    const open=async()=>{if(mobile) await page.getByRole('button',{name:/^Filter/}).click();};
    const apply=async()=>{if(mobile) await page.getByRole('button',{name:'Apply filter',exact:true}).click();};
    const feed=page.locator(mobile?'.mobile-workspace main':'.record-list');
    await open();
    for(const name of ['All','Voice','Stays','Expense','Travel','Workout','Memo']) await expect(picker.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
    await page.screenshot({path:`test-results/category-multi-${width}.png`,fullPage:true});
    await picker.getByRole('button',{name:'Expense',exact:true}).click();
    await expect(picker.getByRole('button',{name:'Expense',exact:true})).toHaveAttribute('aria-pressed','false');
    await expect(picker.getByRole('button',{name:'Voice',exact:true})).toHaveAttribute('aria-pressed','mixed');
    await apply();
    await expect(feed.locator('[data-journal-kind="voice"]')).toHaveCount(6);
    await expect(feed.locator('[data-journal-kind="stay"]')).not.toHaveCount(0);
    await open();
    await expect(picker.getByRole('button',{name:'Expense',exact:true})).toHaveAttribute('aria-pressed','false');
    if(mobile) {
      await picker.getByRole('button',{name:'Expense',exact:true}).click();
      await page.getByRole('dialog').getByRole('button',{name:'Close',exact:true}).click();
      await open();
      await expect(picker.getByRole('button',{name:'Expense',exact:true})).toHaveAttribute('aria-pressed','false');
    }
    await picker.getByRole('button',{name:'Stays',exact:true}).click();
    await apply();
    await expect(feed.locator('[data-journal-kind="stay"]')).toHaveCount(0);
    await expect(feed.locator('[data-journal-kind="voice"]')).toHaveCount(6);
    await open();
    await picker.getByRole('button',{name:'All',exact:true}).click();
    await apply();
    await expect(feed.locator('[data-journal-kind="voice"]')).toHaveCount(9);
    await open();
    await picker.getByRole('button',{name:'Voice',exact:true}).click();
    await picker.getByRole('button',{name:'Stays',exact:true}).click();
    await apply();
    await expect(feed.locator('[data-journal-kind]')).toHaveCount(0);
    await open();
    await picker.getByRole('button',{name:'All',exact:true}).click();
    await apply();
    await expect(feed.locator('[data-journal-kind="voice"]')).toHaveCount(9);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
