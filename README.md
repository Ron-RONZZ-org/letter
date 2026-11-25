# letter

A small public letter service for ronzz.ORG: write a formal letter in Markdown, pick a style, and download a typeset PDF or a Thunderbird-ready `.eml` draft.

- **Backend:** FastAPI + Typst (server-side rendering, no external services).
- **Frontend:** vanilla HTML/CSS/JS, no build framework; all dependencies vendored.
- **Contacts:** each visitor brings their own CardDAV URL and credentials. The letter server never receives them.
- **Persistence:** profile, settings, and contacts live in the browser (`localStorage` / `IndexedDB`).
- **No accounts, no database, no server-side address book.**

## Features

- Three styles: `fr-formal`, `en-formal`, `minimal`; A4 or US Letter.
- Sender and recipient address objects, subject, references, salutation, closing, enclosures, cc.
- Markdown body rendered with [cmarker](https://github.com/SabrinaJewson/cmarker.typ).
- PDF download and preview.
- `.eml` download with `X-Unsent: 1` (opens in compose mode in Thunderbird 91+; older clients can use *Edit As New*), `multipart/alternative` plain + HTML, optional PDF attachment.
- CardDAV address book connection over `PROPFIND` with `address-data`; arbitrary external servers supported if they allow CORS.
- `.vcf` import/export fallback that works with any server (or no server).
- Per-user CSP: the app emits `connect-src` for the visitor's DAV origin from a non-secret `letter_dav_origin` cookie.

## Security model

- CardDAV credentials are stored in the **browser** (`localStorage` when "Remember on this device" is enabled, otherwise `sessionStorage`). They are sent **only** to the user's CardDAV server.
- The letter render API receives only the selected recipient fields; it never receives the CardDAV credential.
- Contacts are stored in **IndexedDB** in the browser.
- The CSP is strict (`script-src 'self'`, no third-party scripts) and adds the user's DAV origin to `connect-src`. Changing the DAV origin reloads the page once so the new policy takes effect.
- There is **no authentication** by design. Rate-limit the service at nginx/Cloudflare.
- Residual risk: any XSS on this origin could read the browser-held DAV credential. Use a read-only CardDAV account or a share token where possible, and keep the app dependency-free.

## CardDAV / CORS

The browser can only read a CardDAV server that allows the letter origin:

```
Access-Control-Allow-Origin: https://letter.ronzz.org
Access-Control-Allow-Methods: GET, HEAD, OPTIONS, PROPFIND, REPORT
Access-Control-Allow-Headers: Authorization, Depth, Content-Type, Accept
Access-Control-Expose-Headers: DAV, ETag
```

- A self-hosted Radicale/Stalwart can be configured accordingly.
- Migadu, Google, iCloud, and stock Nextcloud generally do **not** allow this; use **Import .vcf** for those.
- The app asks for the **address book URL**, not just the server root. It does not implement full CardDAV discovery yet.

## Quick start (development)

```bash
# Python deps
uv sync

# Typst binary for this architecture
bash scripts/fetch_typst.sh

# Browser vCard bundle (vendored build; run after changing the parser)
npm ci
npm run bundle

# Run
LETTER_ALLOW_HTTP_ORIGINS=1 uv run uvicorn app.main:app --host 127.0.0.1 --port 8765
```

Open <http://127.0.0.1:8765/>. `LETTER_ALLOW_HTTP_ORIGINS=1` is only for local HTTP origins (`localhost`/`127.0.0.1`); production requires HTTPS.

## Tests

```bash
uv run ruff check app tests
uv run pytest -q

# E2E (requires the server on :8765 and the mock DAV on :8799)
python tests/mock_dav.py &
node tests/e2e.mjs
```

`tests/e2e.mjs` covers: CSP, vCard import/use, profile persistence, PDF and `.eml` downloads, CardDAV connect (origin cookie + reload), fetch, and 401 error mapping.

## API

- `GET /` — form; emits the per-user CSP.
- `GET /healthz`.
- `POST /api/render/pdf` — JSON `LetterRequest` → PDF.
- `POST /api/render/eml` — JSON `LetterRequest` → `message/rfc822`.

See `app/models.py` for the full request schema. Bodies are capped at 300 KB.

## Docker

```bash
docker build -t letter .
docker compose up -d          # 127.0.0.1:8013 -> 8000
```

The image downloads the pinned Typst release for the target architecture (`TARGETARCH`), bundles the fonts, and runs as UID 10001. The compose file uses a read-only root, tmpfs `/tmp`, a 512 MB memory limit, and no new privileges.

## Deployment (example)

`deploy/nginx.conf.example` proxies `letter.ronzz.org` to `127.0.0.1:8013` with rate limiting and a 300 KB body cap. Do **not** add a CSP header at nginx: the app generates a per-user one. TLS and Cloudflare follow the existing ronzz.ORG vhost patterns.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `TYPST_BIN` | `vendor/typst/typst`, then `typst` in `PATH` | Typst executable |
| `TYPST_FONT_PATH` | `./fonts` | Bundled font directory |
| `LETTER_MAX_CONCURRENT_RENDERS` | `2` | Concurrent Typst processes |
| `LETTER_RENDER_TIMEOUT` | `15` | Seconds per render |
| `LETTER_ALLOW_HTTP_ORIGINS` | unset | Allow `http://localhost`/`127.0.0.1` DAV origins (dev only) |

## Repository layout

```
app/            FastAPI app (models, CSP, render, eml)
templates/      Typst styles + vendored cmarker
app/index.html  the single HTML entrypoint
web/            static frontend assets + vendored vcf bundle
fonts/          bundled Liberation fonts + license
tests/          pytest, mock CardDAV, Playwright E2E
deploy/         nginx example
scripts/        fetch_typst.sh
```

## Attribution

See `THIRD_PARTY.md`. Typst is Apache-2.0, cmarker and vcf are MIT, Liberation fonts are SIL OFL 1.1.

## Repository and CI

- **Source of truth:** `forgejo.ronzz.org/ronzz-org/letter`
- **GitHub mirror:** `github.com/Ron-RONZZ-org/letter` — GitHub Actions runs `CI` (ruff, pytest, Playwright E2E, multi-arch image build → `ghcr.io/ron-ronzz-org/letter`).
- Forgejo has no CI runner; pushes are mirrored to GitHub for CI. Configure a Forgejo **push mirror** to keep the GitHub copy current automatically.

## Known limitations

- No CardDAV discovery (`current-user-principal` / `addressbook-home-set`); paste the address book URL.
- No CardDAV sync-token incremental updates; each fetch is a full `PROPFIND`.
- No server-side contact storage, by design.
- Arbitrary CardDAV servers without CORS require `.vcf` import.
