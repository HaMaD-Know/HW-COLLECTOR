# AI identification setup

AI identification is optional. Without it, every feature works with manual entry.

## How it works

```
App (photo, JPEG ≤ 1600 px)  ──HTTPS──▶  backend/ proxy  ──▶  Anthropic Messages API (Claude, vision)
        ◀── suggestion JSON ──                 holds ANTHROPIC_API_KEY
```

- The app talks only to **your** proxy. The provider key lives in the proxy's environment and is never
  shipped in the app, in `VITE_*` variables, or in the repository.
- The proxy validates the request (JSON only, JPEG/PNG/WebP checked by magic bytes, ≤ 4 MB), rate-limits per
  client IP (6/min, 60/day by default), caps concurrent requests, applies timeouts and never logs image data.
- The model returns a strict JSON schema (structured outputs): suggested casting name, manufacturer,
  series and year **only if legible in the photo**, colour, up to 3 alternatives, a short reasoning summary,
  and `needsManualReview`. There is deliberately no confidence percentage, rarity or price field.
- The app shows **Suggested match** or **Possible match + Needs review**, lets the user pick an alternative,
  edit the name, or ignore the suggestion. The saved record notes whether the name was entered manually,
  confirmed from the AI, or corrected.
- The user is asked for consent before the first photo is uploaded; it can be revoked in Settings.

Model: `claude-opus-5-5` by default (`AI_MODEL`), effort `medium` (`AI_EFFORT`). Requests opt into the API's
server-side refusal fallback, so a request declined by safety classifiers is retried on Anthropic's recommended
fallback model instead of failing.

## 1. Get an API key

Create a key at <https://console.anthropic.com> → API Keys. Treat it like a password.

## 2. Run the proxy locally

```powershell
cd backend
npm.cmd install
copy .env.example .env      # then put your key in ANTHROPIC_API_KEY
npm.cmd run dev             # http://localhost:8787
```

Check it: <http://localhost:8787/health> → `{"ok":true,"configured":true,"provider":"anthropic"}`.

To use it from the browser preview, open **Settings → AI identification**, enter `http://localhost:8787`,
**Save and test**.

A phone cannot reach `localhost` on your PC. For device testing use your PC's LAN address
(`http://192.168.x.x:8787`) — Android blocks plain HTTP by default, so prefer deploying (below) or a HTTPS
tunnel (e.g. `cloudflared tunnel --url http://localhost:8787`).

## 3. Deploy the proxy

Any host that runs Node 22.18+ or Docker works (Render, Railway, Fly.io, Google Cloud Run, a VPS).

- Start command: `node src/server.ts` (or use `backend/Dockerfile`).
- Environment variables: see `backend/.env.example`. Required: `ANTHROPIC_API_KEY`.
- Behind a load balancer set `TRUST_PROXY=true` so rate limiting uses the real client IP.
- Serve over **HTTPS**.
- `ALLOWED_ORIGINS` defaults to the Capacitor app origins (`capacitor://localhost`, `https://localhost`) and
  the Vite dev server.

Example (Google Cloud Run):

```bash
gcloud run deploy hwc-proxy --source backend --region us-central1 --allow-unauthenticated \
  --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest --set-env-vars TRUST_PROXY=true
```

## 4. Point the app at it

Either at build time (applies to everyone who installs that build):

```powershell
$env:VITE_AI_PROXY_URL="https://hwc-proxy.example.com"; npm.cmd run build; npx.cmd cap sync
```

(on GitHub set the repository variable `VITE_AI_PROXY_URL`), or per device in **Settings → AI identification**.

## Abuse protection — be realistic

Anyone who extracts the proxy URL from the app can call it. The proxy's rate limits and request validation
bound the cost; also set a **monthly spend limit** in the Anthropic Console. `APP_CLIENT_TOKEN` /
`VITE_AI_CLIENT_TOKEN` adds a shared header check, but because the token ships inside the app it only deters
casual abuse — it is not authentication. For stronger protection add per-user auth or platform attestation
(Play Integrity / App Attest) in front of the proxy.

## Using a different provider

The app depends only on the `CarIdentificationProvider` interface (`src/services/identification/types.ts`) and
the proxy's JSON contract (`POST /v1/identify` → fields above). To switch providers, replace
`backend/src/anthropic-provider.ts` with another implementation that returns the same shape; the app needs no
changes.

## Error handling

| Situation | What the user sees |
| --- | --- |
| No proxy configured | "AI identification is not set up, so type the name below." |
| Offline | Offline message, manual entry |
| Timeout (45 s) | Try again / Type name instead |
| 429 rate limited | "Too many identification requests. Wait a minute…" |
| Photo too large / wrong type | Specific message; photos are already resized to ≤ 1600 px JPEG before upload |
| Provider refusal | "The AI service declined to identify this photo." |
| Malformed response | Rejected, never shown as a result |
