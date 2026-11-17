# MABRIG SwarmVerify — Cloudflare-native cloud edition

This repository fixes the Cloudflare Workers Builds integration of the previously empty `mabrig1/MABRIG-SwarmVerify` repository. Cloudflare Workers cannot directly host the existing Python FastAPI + Playwright Chromium backend. Instead, this **explicitly limited cloud edition** provides real **server-side HTTP/HTML** audits and a responsive web dashboard. It is neither a 50-agent AI system nor full browser QA, and doesn't claim security or compliance certification.

## Deployment

The existing Cloudflare Worker project is `mabrig-swarmverify`. Its Workers Builds settings use repository `mabrig1/MABRIG-SwarmVerify`, branch `main`, root `/`, no build command, and deploy command `npx wrangler deploy`. With the provided `wrangler.jsonc`, `package.json` and `src/index.js`, those settings are compatible with the repository. Cloudflare serves `public/index.html` as a static asset.

For manual verification: `npm install`, `npm test`, `npm run build`, `npx wrangler deploy --dry-run`. Avoid publishing or committing API keys. Build dependencies require Node 20.19+ or 22.12+; Node 22 is recommended.

### Required production secret

Set **ADMIN_TOKEN** (20+ random characters) as an encrypted *Worker secret*, not a plain-text variable, in Cloudflare Worker > Settings > Variables and secrets. Generate a fresh private token and enter the same value in the site's **New audit** screen. Without it, audits fail closed (`HTTP 503`) and only public dashboard/health are available. Do not add `ADMIN_TOKEN` to `wrangler.jsonc` or GitHub.

`AUDIT_ALLOWED_HOSTS` is the only committed non-sensitive configuration variable; it specifies the exact hostnames of domains the operator is authorized to scan, currently `aiuniversityhq.uk,buildrx.online`. No wildcard hosts are allowed. **Remove any plaintext OPENROUTER_API_KEY from Cloudflare variables and revoke exposed keys with the provider; this app does not require an OpenRouter key.**

## Included tests and limits

- Public `/api/health`, authenticated `POST /api/audit`, Cloudflare edge dashboard.
- HTTPS-only, exact hostname allowlist, blocked sensitive routes/query strings/credentials/ports, no redirects followed.
- Up to four pages via GET with 9-second request timeouts. Reports HTTP status, HTML heading/language/alt/labels/metadata/viewport and response-header clues. Limits HTML to 350 KB.
- Heuristic readiness score only over tested checks. Explicit `not_tested` for browser/mobile interaction, login, payments and penetration testing.
- Reports temporarily stored in the visitor's browser localStorage (not shared cloud storage); operator token stays in tab memory and is cleared after audit.

**Not yet present:** true Playwright browser audits, screenshots, dynamic JS workflows, durable cross-device audit history, paid AI model swarms, production-ready multi-tenant identity or billing, certifications, and authenticated workflows. The standalone local Python app remains a separate tool; do not copy its `ADMIN_TOKEN` or data files into Git.

## Security notes

This is an intentionally constrained prototype, not a public scanning SaaS. Deploy behind Cloudflare Access for operator-only access if desired. Before increasing concurrency or making more hosts available, implement robust account authorization, rate limiting, audit records, and consent verification. A GET can still trigger unexpected effects on improperly implemented websites. Scan only sites you own or have authorization to assess. Never interpret a passing result as absence of vulnerabilities.
