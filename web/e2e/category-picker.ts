import type { Page } from '@playwright/test';
/** Select an exclusive category using the multi-select controls. */
export async function onlyCategory(page: Page, category: string, mobile = false) {
  const picker = mobile ? page.locator('.category-chip-picker') : page.getByRole('group', { name: 'Recording category' });
  await picker.getByRole('button', { name: 'All', exact: true }).click();
  if (category === 'Voice') await picker.getByRole('button', { name: 'Stays', exact: true }).click();
  else {
    await picker.getByRole('button', { name: 'Voice', exact: true }).click();
    if (category !== 'Stays') {
      await picker.getByRole('button', { name: 'Stays', exact: true }).click();
      await picker.getByRole('button', { name: category, exact: true }).click();
    }
  }
}
