# Pre-launch security checklist

Static site: no server code, no database, no login, no third-party scripts. The quote form validates in the browser and sends nothing. Most items are therefore N/A; each says why. Checked 2026-11-03.

| # | Item | Status | Notes and how it was checked |
|---|---|---|---|
| 1 | Hide API keys | OK | No keys exist. `grep -rniE "api[_-]?key\|secret\|token\|password\|bearer\|sk_live\|AKIA"` over `src scripts public` and config files: only matches are CSS "design tokens". `.env*` is in `.gitignore`. |
| 2 | Purge git secrets | OK | History is this project's own commits only; no key was ever added (same grep as above over all tracked files). |
| 3 | Public DB key only | N/A | No database. |
| 4 | Enable RLS | N/A | No database. |
| 5 | Encrypt sensitive data | OK / N/A | Nothing stored. In transit: HTTPS forced by Vercel plus `Strict-Transport-Security` in `vercel.json`. |
| 6 | Server-side auth | N/A | No accounts or protected pages. |
| 7 | Lock record access (IDOR) | N/A | No records. |
| 8 | Block field tampering | N/A now | No backend. For a real form: the server must accept only the known fields (see README, "Connecting a real form backend"). |
| 9 | Secure session cookies | N/A | No cookies at all. Two preferences in `localStorage` (`kp-unit`, `kp-demo-dismissed`), values checked against an allowlist in `public/boot.js`. |
| 10 | Hash passwords | N/A | No passwords. |
| 11 | Rate limit login | N/A | No login. A real form endpoint needs an IP rate limit (README). |
| 12 | Bot protection | OK (client) | Hidden honeypot field `website` on the quote form. No external CAPTCHA (would need an account; owner's decision). Real dropping of bot submissions has to happen on the server. |
| 13 | Parameterize queries | N/A | No queries. |
| 14 | Validate all input | OK (client) / server TODO | Every field validated in `src/lib/rfq-validate.ts` (unit-tested: required, email, ranges, whole numbers, future date, file rules). A backend must repeat the checks. |
| 15 | Escape user content | OK | User input is written only with `textContent`/`createElement` (`rfq.ts`, `explorer.ts`). No `innerHTML`. The only `set:html` is JSON-LD built from our own config, with `<` escaped. Tested by entering `<img src=x onerror=alert(1)>` and `<b>Dana</b>`: shown as text. |
| 16 | Restrict file uploads | OK (client) | Allowlist `.step .stp .iges .igs .dwg .dxf .pdf` on the last extension (so `part.step.exe` is rejected), 25 MB per file, max 5 files, empty files rejected; unit tests plus a browser run with `.zip` and a 26 MB file. Files never leave the browser. Content (magic bytes) check belongs on the server when one exists. |
| 17 | Trim API responses | N/A | No API. |
| 18 | Security headers | OK | `vercel.json`: CSP `default-src 'self'` with no `unsafe-inline` or `unsafe-eval`, `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`, `base-uri 'self'`; HSTS (2 years, preload); `X-Frame-Options: DENY`; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy` denying camera, microphone, geolocation, payment, USB; `Cross-Origin-Opener-Policy: same-origin`. Verified locally with `npm run shoot -- --csp`: all 22 pages load under the real header with 0 violations (and the check does catch a deliberately added inline style). |
| 19 | Force HTTPS | OK (on deploy) | Vercel redirects HTTP to HTTPS by default; CSP adds `upgrade-insecure-requests`. Re-check with `curl -I http://<domain>` after the first deploy. |
| 20 | Scan dependencies | OK | `npm audit`: 0 vulnerabilities (2026-11-03). Runtime dependencies: `astro` and two font packages; the rest are dev tools. |

Exceptions to note:

- JSON-LD uses inline `<script type="application/ld+json">`. It is data, not executed, so `script-src 'self'` does not block it.
- A real form backend on another origin must be added to `connect-src` (README).
