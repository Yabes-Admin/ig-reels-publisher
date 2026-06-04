import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

function toAssTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function buildAss(spec) {
  const { width, height, scenes } = spec;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Bubble,Inter,84,&H00FFFFFF,&H00FFFFFF,&H001673F9,&H001673F9,1,0,0,0,100,100,0,0,4,32,4,2,80,80,420,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = scenes.map(scene => {
    const start = toAssTime(scene.start + 0.3);
    const end = toAssTime(scene.end - 0.5);
    const text = scene.caption.replace(/\n/g, '\\N');
    return `Dialogue: 0,${start},${end},Bubble,,0,0,0,,{\\fad(300,300)}${text}`;
  }).join('\n');

  return header + events + '\n';
}

export async function generateCaptions(specPath, outPath) {
  const spec = JSON.parse(await readFile(specPath, 'utf8'));
  const ass = buildAss(spec);
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, ass, 'utf8');
  return outPath;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  const out = await generateCaptions('spec/reel.json', 'dist/captions.ass');
  console.log(`captions written: ${out}`);
}
