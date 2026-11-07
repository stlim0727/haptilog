import { createHash, createSign } from 'node:crypto';
import { appendFile, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.haptilog.watch';
const uploadBase = base.replace('/androidpublisher/', '/upload/androidpublisher/');

export async function prepareScreenshots(api, suites) {
  const { id } = await api('/edits', { method: 'POST', json: {} });
  if (!id) throw new Error('Play did not return an edit ID');
  try {
    const listings = await api(`/edits/${id}/listings`);
    const languages = new Set((listings.listings ?? []).map(l => l.language));
    for (const { language } of suites) {
      if (!languages.has(language)) throw new Error(`Missing Play listing: ${language}`);
    }
    const tracks = await api(`/edits/${id}/tracks`);
    console.log('Current Play tracks:', JSON.stringify(tracks.tracks ?? []));
    for (const { language, images } of suites) {
      const path = `/edits/${id}/listings/${language}/wearScreenshots`;
      await api(path, { method: 'DELETE' });
      for (const image of images) {
        await api(`${path}?uploadType=media`, { method: 'POST', png: image, upload: true });
      }
      const uploaded = await api(path);
      const expected = images.map(b => createHash('sha256').update(b).digest('hex'));
      const actual = (uploaded.images ?? []).map(i => i.sha256);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) {
        throw new Error(`Screenshot count, order or checksum mismatch: ${language}`);
      }
      console.log(`Verified ${language}: ${images.length} Wear OS screenshots`);
    }
    // The bundle action adds the AAB and track, then commits this same edit once.
    return id;
  } catch (error) {
    await api(`/edits/${id}`, { method: 'DELETE' }).catch(() => {});
    throw error;
  }
}

async function main() {
  const suites = [];
  for (const [directory, language] of [['en', 'en-US'], ['ko', 'ko-KR']]) {
    const folder = resolve('screenshots', directory);
    const files = (await readdir(folder)).filter(f => f.endsWith('.png')).sort();
    if (files.length !== 6) throw new Error(`Expected six screenshots in ${folder}`);
    const images = await Promise.all(files.map(f => readFile(resolve(folder, f))));
    for (const b of images) {
      if (b.length < 24 || b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
        || b.readUInt32BE(16) !== 454 || b.readUInt32BE(20) !== 454) {
        throw new Error(`Invalid 454×454 PNG in ${folder}`);
      }
    }
    suites.push({ language, images });
  }
  const account = JSON.parse(process.env.PLAY_SERVICE_ACCOUNT_JSON ?? '{}');
  if (!account.client_email || !account.private_key) throw new Error('Missing Play service account');
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: account.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key, 'base64url');
  const auth = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}`,
    }), signal: AbortSignal.timeout(60000),
  });
  if (!auth.ok) throw new Error(`Google authentication failed: HTTP ${auth.status}`);
  const { access_token: token } = await auth.json();
  if (!token) throw new Error('Google did not return an access token');
  const api = async (path, options = {}) => {
    const response = await fetch((options.upload ? uploadBase : base) + path, {
      method: options.method ?? 'GET',
      headers: { Authorization: `Bearer ${token}`,
        ...(options.png ? { 'Content-Type': 'image/png' } : options.json ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.png ?? (options.json ? JSON.stringify(options.json) : undefined),
      signal: AbortSignal.timeout(60000),
    });
    const text = await response.text();
    if (!response.ok) {
      let message = 'Unknown Play API error';
      try { message = JSON.parse(text).error.message; } catch {}
      throw new Error(`Play ${options.method ?? 'GET'} ${path}: HTTP ${response.status}: ${message}`);
    }
    return text ? JSON.parse(text) : {};
  };
  const id = await prepareScreenshots(api, suites);
  await appendFile(process.env.GITHUB_OUTPUT, `edit_id=${id}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
