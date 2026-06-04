import { readFile } from 'node:fs/promises';

const GRAPH = 'https://graph.facebook.com/v21.0';

async function gpost(path, params) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { method: 'POST' });
  const body = await r.json();
  if (!r.ok) throw new Error(`POST ${path} → ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

async function gget(path, params) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url);
  const body = await r.json();
  if (!r.ok) throw new Error(`GET ${path} → ${r.status}: ${JSON.stringify(body)}`);
  return body;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function publishReel({ videoUrl, caption }) {
  const igUserId = process.env.IG_USER_ID;
  const token = process.env.IG_ACCESS_TOKEN;
  if (!igUserId) throw new Error('IG_USER_ID not set');
  if (!token) throw new Error('IG_ACCESS_TOKEN not set');

  // 1. Create container
  console.log('graph: create REELS container');
  const created = await gpost(`${igUserId}/media`, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    access_token: token
  });
  const creationId = created.id;
  console.log(`  creation_id=${creationId}`);

  // 2. Poll until FINISHED (or ERROR). IG typically takes 10-60s.
  const deadline = Date.now() + 5 * 60 * 1000;
  let status;
  while (Date.now() < deadline) {
    await sleep(5000);
    const r = await gget(`${creationId}`, { fields: 'status_code,status', access_token: token });
    status = r.status_code;
    console.log(`  status=${status}`);
    if (status === 'FINISHED') break;
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`container ${status}: ${JSON.stringify(r)}`);
    }
  }
  if (status !== 'FINISHED') throw new Error(`container not ready within 5min, last=${status}`);

  // 3. Publish
  console.log('graph: publish');
  const pub = await gpost(`${igUserId}/media_publish`, {
    creation_id: creationId,
    access_token: token
  });
  console.log(`  media_id=${pub.id}`);
  return { creationId, mediaId: pub.id };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const spec = JSON.parse(await readFile('spec/reel.json', 'utf8'));
  const videoUrl = process.env.VIDEO_URL;
  if (!videoUrl) throw new Error('VIDEO_URL env required for standalone publish');
  const out = await publishReel({ videoUrl, caption: spec.publish.captionTemplate });
  console.log(JSON.stringify(out, null, 2));
}
