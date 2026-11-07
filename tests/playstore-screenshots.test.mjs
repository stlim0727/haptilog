import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareScreenshots } from '../scripts/playstore-screenshots.mjs';

const suites = ['en-US', 'ko-KR'].map(language => ({
  language, images: Array.from({ length: 6 }, (_, i) => Buffer.from(`${language}-${i}`)),
}));

function mock({ missingLanguage = false, corrupt = false, failUpload = false } = {}) {
  const calls = [];
  const images = new Map();
  const api = async (path, options = {}) => {
    calls.push({ path, ...options });
    if (path === '/edits') return { id: 'test-edit' };
    if (path.endsWith('/listings')) return { listings: (missingLanguage ? ['en-US'] : ['en-US', 'ko-KR']).map(language => ({ language })) };
    if (path.endsWith('/tracks')) return { tracks: [] };
    if (path === '/edits/test-edit') return {};
    const key = path.split('?')[0];
    if (options.method === 'DELETE') { images.set(key, []); return {}; }
    if (options.png) {
      if (failUpload) throw new Error('Upload failed');
      images.get(key).push({ sha256: createHash('sha256').update(options.png).digest('hex') });
      return {};
    }
    return { images: corrupt ? [] : images.get(key) };
  };
  return { api, calls };
}

test('verifies both suites and leaves one open edit for the bundle action', async () => {
  const { api, calls } = mock();
  assert.equal(await prepareScreenshots(api, suites), 'test-edit');
  assert.equal(calls.filter(c => c.png).length, 12);
  assert.equal(calls.filter(c => c.method === 'DELETE').length, 2);
  assert.ok(calls.every(c => !c.path.includes(':commit')));
});

test('missing locale aborts before replacing any screenshots and deletes the edit', async () => {
  const { api, calls } = mock({ missingLanguage: true });
  await assert.rejects(prepareScreenshots(api, suites), /Missing Play listing: ko-KR/);
  assert.equal(calls.filter(c => c.png).length, 0);
  assert.deepEqual(calls.at(-1), { path: '/edits/test-edit', method: 'DELETE' });
});

for (const mode of ['corrupt', 'failUpload']) {
  test(`${mode} discards the uncommitted edit`, async () => {
    const { api, calls } = mock({ [mode]: true });
    await assert.rejects(prepareScreenshots(api, suites), /mismatch|Upload failed/);
    assert.deepEqual(calls.at(-1), { path: '/edits/test-edit', method: 'DELETE' });
    assert.ok(calls.every(c => !c.path.includes(':commit')));
  });
}
