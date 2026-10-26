import { expect } from '@playwright/test';
import { test } from './fixtures';
import { staysFixture, openStays } from './stays-fixture';

test('combined sync withdrawal explains audio scope and requires watch-side re-enable', async ({ page }) => {
  const { state } = await staysFixture(page);
  Object.assign(state.data.state, { consent_scope: 'all_records' });
  const dialog = await openStays(page);
  await expect(dialog.getByRole('heading', { name: 'Cloud sync', exact: true })).toBeVisible();
  await expect(dialog.getByText('Shared with your watch.', { exact: false })).toContainText('recordings');
  await dialog.getByRole('button', { name: 'Turn off sync', exact: true }).click();
  await expect(dialog.getByText('Enable cloud sync in watch settings.', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Agree and enable sync', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('checkbox', { name: /Include previous stays/ })).toHaveCount(0);
  expect(state.data.state.consent_enabled).toBe(false);
});
