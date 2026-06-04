# ig-reels-publisher

Fully automated Instagram Reels pipeline.
`spec/reel.json` → ffmpeg (Ken Burns + ASS captions) → edge-tts VO → muxed MP4 → GitHub Release → Instagram Graph API.

Runs in GitHub Actions on a schedule. Zero local infrastructure.

## Pipeline

```
spec/reel.json + assets/*.png + assets/music.mp3
        │
        ├─ captions.js  → dist/captions.ass
        ├─ tts.js       → dist/vo/vo_{1,2,3}.mp3
        ├─ render.js    → dist/video.mp4 (silent, 1080x1920, 24s)
        ├─ mux.js       → dist/out.mp4 (final, audio mixed)
        ├─ upload.js    → GH Release asset → public URL
        └─ publish.js   → IG Graph API (create container → poll → publish)
```

## Local dev

```powershell
# Build only — no upload, no publish
npm run build

# Build + upload as GH release (needs GITHUB_TOKEN with repo scope)
npm run build-upload

# Full pipeline (needs all IG secrets)
npm run publish
```

Requires: Node 20+, ffmpeg, Python 3 with `edge-tts` (`pip install edge-tts`).
Linux/macOS: `apt install fonts-inter fonts-noto-color-emoji` for the ASS captions to render emoji + Latin properly.
Windows: install [Inter](https://rsms.me/inter/) or rely on the Segoe UI fallback.

## Secrets the GHA workflow expects

| Secret | What | Where to get |
|---|---|---|
| `IG_USER_ID` | Instagram Business account ID | Graph API Explorer → `GET /me/accounts` then `?fields=instagram_business_account` |
| `IG_ACCESS_TOKEN` | Long-lived (60-day) page access token | developers.facebook.com → app → Graph API Explorer → exchange short→long |
| `META_APP_ID` | Meta app ID (only for refresh workflow) | developers.facebook.com → your app → Settings |
| `META_APP_SECRET` | Meta app secret (only for refresh workflow) | same as above |
| `GH_PAT_FOR_SECRETS` | Classic PAT with `repo` + `admin:repo_hook` | github.com/settings/tokens — needed because default `GITHUB_TOKEN` can't update Secrets |
| `AZURE_SPEECH_KEY` | optional — only if `spec/reel.json` sets `voice.provider=azure` | Azure Portal → Speech resource |
| `AZURE_SPEECH_REGION` | optional — e.g. `southeastasia` | same as above |

## Swap edge-tts → Azure Speech

Edit `spec/reel.json`:

```json
"voice": {
  "provider": "azure",   // was "edge"
  ...
}
```

Add `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` as repo secrets. Done. No code change.

## Schedule

`.github/workflows/post-reel.yml` runs daily at 02:00 UTC (09:00 WIB).
Disable by deleting the `schedule:` block. Trigger manually any time from
Actions tab → "Post IG Reel" → "Run workflow".

## Music

Drop your chosen royalty-free track at `assets/music.mp3`. Without it the
pipeline still runs but the reel is VO-only. The default spec credits
SKAI ISYOURGOD in the caption — adjust `spec/reel.json` → `publish.captionTemplate`
to match the specific track you used.

## Onboarding a second account

Fork repo, replace `spec/reel.json` + `assets/`, set the destination account's
`IG_USER_ID` + `IG_ACCESS_TOKEN` as secrets. Done.
