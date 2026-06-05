import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const FAL_KEY = process.env.FAL_KEY;
if (!FAL_KEY) throw new Error('FAL_KEY not set');

const MODEL = 'https://fal.run/fal-ai/nano-banana/edit';

// Anchor: scene3.png from main branch on GitHub (public repo, raw URL works
// without auth). Image is the Gemini-generated master character — every
// edit must preserve her face/hair/clothing identity.
const ANCHOR_URL = 'https://raw.githubusercontent.com/Yabes-Admin/ig-reels-publisher/main/assets/scene3.png';

const FACE_LOCK = "Keep this EXACT person — same face, same Indonesian features, same hair color and length and styling, same skin tone, same eye shape, same makeup level. Same outfit (navy/dark blazer over patterned blouse). Photorealistic, vertical 9:16 portrait.";

const edits = [
  {
    id: 1,
    out: 'assets/scene1.png',
    prompt: `${FACE_LOCK} Change ONLY the setting and her expression: she is now sitting at a cluttered home office desk late at night under warm dim lamplight, looking stressed and overwhelmed. In front of her: an open laptop showing a complicated cluttered Excel spreadsheet with hundreds of rows of tenant billing data, scattered paper invoices, a coffee cup. Her expression is tired and frustrated — brow slightly furrowed, mouth in a soft worried line (not smiling), one hand at her temple or rubbing her eyes in exhaustion. Background: dim home office, papers piled, warm desk lamp glow.`
  },
  {
    id: 2,
    out: 'assets/scene2.png',
    prompt: `${FACE_LOCK} Change ONLY the setting and her expression: she is now holding a sleek tablet displaying a clean Property ERP dashboard (green checkmarks, billing charts, "500 WhatsApp Bills Sent" success notification visible). Her expression is delighted, big satisfied confident smile, looking down at the tablet screen with pride and a sense of relief. Background: same modern luxury Jakarta lobby (marble floors, brass accents, floor-to-ceiling windows showing soft-blurred skyline) — keep the setting consistent with the anchor image.`
  },
];

async function edit(spec) {
  console.log(`[${spec.id}] editing → ${spec.out}`);
  const r = await fetch(MODEL, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: spec.prompt,
      image_urls: [ANCHOR_URL],
      num_images: 1,
      output_format: 'png'
    }),
  });
  const body = await r.json();
  if (!body.images?.[0]?.url) {
    console.log(`[${spec.id}] FAIL: ${JSON.stringify(body).slice(0, 400)}`);
    return null;
  }
  const png = await fetch(body.images[0].url);
  const buf = Buffer.from(await png.arrayBuffer());
  await mkdir(dirname(spec.out), { recursive: true });
  await writeFile(spec.out, buf);
  console.log(`[${spec.id}] saved ${(buf.length / 1024).toFixed(0)} KB → ${spec.out}`);
  console.log(`        URL: ${body.images[0].url}`);
  return { id: spec.id, url: body.images[0].url };
}

console.log(`anchor: ${ANCHOR_URL}\n`);
const results = await Promise.all(edits.map(edit));
console.log('\n=== done ===');
results.forEach(r => r && console.log(`scene${r.id}: ${r.url}`));
