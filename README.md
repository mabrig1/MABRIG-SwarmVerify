# MABRIG SwarmVerify — Cloudflare-native cloud edition

This repository contains the Cloudflare Worker edition of SwarmVerify. Version 0.3 adds an optional evidence-grounded OpenRouter free-model 20-role demonstration while keeping the original HTTP/HTML inspector. Cloudflare Workers cannot directly host the existing Python FastAPI + Playwright Chromium backend. Instead, this **explicitly limited cloud edition** provides real **server-side HTTP/HTML** audits and a responsive web dashboard. It is not full browser QA or a fleet of 20 independent autonomous processes, and does not claim security or compliance certification.

## Deployment

The existing Cloudflare Worker project is `mabrig-swarmverify`. Its Workers Builds settings use repository `mabrig1/MABRIG-SwarmVerify`, branch `main`, root `/`, no build command, and deploy command `npx wrangler deploy`. With the provided `wrangler.jsonc`, `package.json` and `src/index.js`, those settings are compatible with the repository. Cloudflare serves `public/index.html` as a static asset.

For manual verification: `npm install`, `npm test`, `npm run build`, `npx wrangler deploy --dry-run`. Avoid publishing or committing API keys. Build dependencies require Node 20.19+ or 22.12+; Node 22 is recommended.

### Required production secret

Set **ADMIN_TOKEN** (20+ random characters) as an encrypted *Worker secret*, not a plain-text variable, in Cloudflare Worker > Settings > Variables and secrets. Generate a fresh private token and enter the same value in the site's **New audit** screen. Without it, audits fail closed (`HTTP 503`) and only public dashboard/health are available. Do not add `ADMIN_TOKEN` to `wrangler.jsonc` or GitHub.

`AUDIT_ALLOWED_HOSTS` is the only committed non-sensitive configuration variable; it specifies the exact hostnames of domains the operator is authorized to scan, currently `aiuniversityhq.uk,buildrx.online`. No wildcard hosts are allowed. **For AI mode only:** use a *fresh, encrypted Cloudflare secret* named `OPENROUTER_API_KEY`, not a plain-text variable. Rotate any previously exposed keys in the OpenRouter console. Never expose it in `wrangler.jsonc`, GitHub, browser JavaScript, issue comments, or screenshots.


## Optional 20-role OpenRouter free-model demonstration

Open the **20-agent AI demo** tab, supply an approved URL and the same existing `ADMIN_TOKEN` used for HTTP audits, select a free model, and press **Run 20-role AI demonstration**. No OpenRouter key is entered in the browser.

- Four squads cover five specialist roles each, using **four free-model requests when the first succeeds**, or **up to five total** with a one-time free-router recovery. The first squad acts as a canary, and a complete first-squad failure stops further calls. These are not 20 independent LLM instances or autonomous browsers.
- A new deterministic HTTP audit is run first on up to four safe, approved, public pages. Only check IDs, labels, statuses, number of pages and derived HTTP score are passed to OpenRouter; no HTML, user content, token, cookies, or sensitive headers are uploaded.
- Each AI suggestion must cite a real check ID permitted for its role. Response parsing supports bounded JSON or a minimal line protocol, reducing failed responses from free models that do not enforce structured JSON. Invalid, absent or malformed output is flagged **inconclusive**, never silently treated as a passed test. Untested JavaScript, mobile rendering, sign-in and payments remain *not tested*.
- Models are **strictly allowlisted as free**: `nvidia/nemotron-3.5-lightning:free` (default), `liquid/lfm-3-1.7b:free`, and `openrouter/free`. Arbitrary or paid model IDs are rejected on the server. There are no retries or paid fallbacks.
- Each request has a 40-second timeout; after the first canary succeeds, the three remaining squads run concurrently. A run consumes up to five of the account's free requests. API HTTP statuses, no-final-answer, invalid format and quota-limit errors are categorized without showing raw provider output. 429 quota errors stop the run to conserve the account. This prototype **does not provide distributed quota accounting**, billing, multi-tenant access control or rate limiting; keep it operator-only.
- On NVIDIA's free endpoint, avoid submitting personal/confidential data; provider terms may permit logging/retention. This implementation sends only minimal public test metadata.
- Results stay in the active page until you export them; the administrator token is cleared from the input after each run.

The public `GET /api/health` reports only `swarm_demo_configured: true/false`, never key values. Actual functioning of OpenRouter requires a fresh valid key and available free quota. The site remains useful in HTTP-only mode without the key.

## Included tests and limits

- Public `/api/health`, authenticated `POST /api/audit`, Cloudflare edge dashboard.
- HTTPS-only, exact hostname allowlist, blocked sensitive routes/query strings/credentials/ports, no redirects followed.
- Up to four pages via GET with 9-second request timeouts. Reports HTTP status, HTML heading/language/alt/labels/metadata/viewport and response-header clues. Limits HTML to 350 KB.
- Heuristic readiness score only over tested checks. Explicit `not_tested` for browser/mobile interaction, login, payments and penetration testing.
- Reports temporarily stored in the visitor's browser localStorage (not shared cloud storage); operator token stays in tab memory and is cleared after audit.

**Not yet present:** true Playwright browser audits, screenshots, dynamic JS workflows, durable cross-device audit history, independent 20-agent runtimes, production-ready multi-tenant identity or billing, certifications, and authenticated workflows. The standalone local Python app remains a separate tool; do not copy its `ADMIN_TOKEN` or data files into Git.

## Security notes

This is an intentionally constrained prototype, not a public scanning SaaS. Deploy behind Cloudflare Access for operator-only access if desired. Before increasing concurrency or making more hosts available, implement robust account authorization, rate limiting, audit records, and consent verification. A GET can still trigger unexpected effects on improperly implemented websites. Scan only sites you own or have authorization to assess. Never interpret a passing result as absence of vulnerabilities.
