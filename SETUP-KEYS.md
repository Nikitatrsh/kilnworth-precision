# Setup: keys and accounts for the quote form

The quote form works on your computer with no accounts (it writes emails and files into `.local/`). This page is the checklist for the day the two services are connected, so that requests really reach a mailbox. Nothing in the code changes: you only create two accounts and paste a few values into Vercel.

Order: Resend (email) first, then Vercel (hosting and file storage), then test.
Both have free plans that are enough for a demo. Check the current limits on their pricing pages before you rely on them.

## 1. Resend (email)

1. Create an account at [resend.com](https://resend.com) with the address that should receive the test emails. **Remember this address**: in test mode Resend delivers only to it.
2. Open **API Keys** and create a key. Name it `kilnworth-demo`, permission **Sending access** (not Full access). Copy it once; Resend will not show it again. It starts with `re_`.
3. Do not add a domain yet. Without one, Resend lets you send from `onboarding@resend.dev`, but only to the address you signed up with. That is exactly what test mode needs.

## 2. Vercel (hosting and file storage)

1. Create or open your account at [vercel.com](https://vercel.com) (Hobby plan; it is for non-commercial use, which a portfolio demo is. A real client's site goes on the client's own account).
2. **Add New → Project**, import the GitHub repository `kilnworth-precision`. Keep the defaults (Vercel detects Astro). Do not deploy yet if it offers a choice; the first deploy without variables is harmless but the form will answer with an error on purpose.
3. In the project open **Storage → Create → Blob**. When it asks for access, choose **Private** (drawings can be confidential). Connect it to the project for **Production, Preview and Development**. Vercel adds `BLOB_READ_WRITE_TOKEN` to the project by itself; you do not copy it anywhere.
4. In **Settings → Environment Variables** add the variables below.

| Name | Value | Notes |
|---|---|---|
| `RESEND_API_KEY` | the `re_...` key from step 1.2 | mark it **Sensitive** |
| `MAIL_FROM` | `onboarding@resend.dev` | test sender; changes later |
| `MAIL_TO_SHOP` | the address you signed up to Resend with | in test mode both shop mail and buyer reply land with you anyway |
| `MAIL_TEST_RECIPIENT` | the same address | redirects **every** email here, and puts `[TEST -> original address]` in the subject |
| `BLOB_READ_WRITE_TOKEN` | added by Vercel when you connected the store | check that it exists |

Every variable is explained in `.env.example` in the repository.

5. **Deployments → Redeploy** (or push a commit) so the functions see the variables.
6. In `astro.config.mjs`, `site:` is `https://kilnworth-precision.vercel.app`. If Vercel gives the project another address, change it there and in `src/config/site.ts` where needed.

## 3. Test it

On the deployed site open `/rfq` and send a request with a small PDF or STEP file. Then check:

1. The form shows a request number like `KP-261104-7K3QX`.
2. Two emails arrive in your inbox within a minute: one with subject `[TEST -> quotes@...] Quote request KP-...` (the shop's copy) and one `[TEST -> your address] We received your quote request KP-...` (the buyer's reply). Both carry the same number.
3. In the shop's copy, the file link opens the file. (Links are valid for 7 days.) **Reply-To** is the buyer's address.
4. Vercel project → **Logs** shows `[rfq] KP-... accepted, files: 1` and no names or addresses.
5. The browser console on `/rfq` shows no Content-Security-Policy errors. If the upload is blocked, the console names the blocked address; it has to be added to `connect-src` in `vercel.json`.
6. Try a 26 MB file and an `.exe`: both must be refused with a clear message.

Something wrong:

- *The form says "Something went wrong on our side"*: open Vercel **Logs**. `misconfigured: ... missing: ...` names the variable you forgot. `Resend answered 403` usually means the recipient is not the account owner: set `MAIL_TEST_RECIPIENT`. `Resend answered 401` means a wrong key.
- *Emails missing*: check Resend → **Emails** for the delivery status, then spam.
- *You want to try it without deploying*: put the same variables (test values only) in a file `.env.local` in the project folder, run `npm run dev:api` and `npm run dev`. The file is ignored by git.

## 4. From test to a real client

Do this only for a client's site, on the client's accounts:

1. In Resend add the client's domain and create the DNS records it shows (SPF, DKIM). Wait until it says **Verified**.
2. Set `MAIL_FROM` to an address on that domain, `MAIL_TO_SHOP` to the shop's real inbox, and **delete** `MAIL_TEST_RECIPIENT`.
3. In `src/config/site.ts` set `demo: false` and `noindex: false`, replace the fictional contact details, and review `/privacy` (it must match what is really collected, kept and who processes it: Resend and Vercel).
4. Add a stronger request limit (Upstash, or a Vercel Firewall rate-limit rule on `/api/*`). The built-in limiter counts per server instance only.
5. Run the checks in the README, deploy, and repeat the test in section 3 with the real address.

## Keys and safety

- Never paste a key into a chat, an issue, a commit or a screenshot. If one leaks, delete it in Resend (API Keys) at once and make a new one; the leaked one stops working immediately.
- The repository must stay free of values: `.env*` files are ignored by git except `.env.example`, which has names only.
- Use only test or sandbox keys while this is a demo.
