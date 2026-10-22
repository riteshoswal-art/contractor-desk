# Contractor Desk for Pune Developers

A small **validation experiment**, not a public marketplace. It helps one founder
test whether small and mid-sized residential developers in Pune struggle to find
available replacement contractors when work is disrupted.

**That problem is not yet proven.** This repository contains no research
results, no real contractor or developer data, and no metrics. Nothing the tool
shows proves demand: only your real conversations and outcomes can.

## What it does

| Area | Where | What happens |
|---|---|---|
| Contractor registration | `/register` | A contractor enters trade, Pune area, availability, mobile number and ticks a consent box. The server validates everything and adds a row to a private Google Sheet. |
| Developer request | `/request` | A developer describes a disruption in plain English. Gemini (server-side) suggests trade, locality, start date, duration and notes; the developer reviews and edits them; the request is saved. |
| Matching | `/admin` (password) | Plain rules (no AI) list up to five potential contractors per request, with reasons and what is missing. |
| Message + WhatsApp link | `/admin` | Gemini drafts a short message from the saved request facts; you edit and approve it; you get a click-to-chat link. **Nothing is ever sent for you.** |
| Outcomes + dashboard | `/admin` | You record what really happened. The dashboard shows honest counts, and percentages/medians only with at least 5 data points. TEST and REAL are always separate. |

Contractors are **not verified, vetted, insured or confirmed available** by this
tool. A "potential match" only means the saved details fit.

## Setup (once)

You need: Node.js 20+ (Node 24 was used), a Google account, and a Gemini API key.
Do not paste any secret into chat, email or a document.

### 1. Install

```bash
npm install
```

### 2. Google Sheet (private)

1. In Google Cloud Console create a project, enable the **Google Sheets API**, and
   create a **service account** (no roles needed) with a **JSON key**. Use a
   personal Google account if your school or work account blocks key creation.
   Keep the downloaded JSON file **outside this folder**.
2. Create a Google Sheet with three tabs named exactly `Contractors`,
   `Requests` and `Outcomes`.
3. In each tab press Ctrl+A, then **Format > Number > Plain text**, *before*
   typing anything. This stops Google Sheets turning phone numbers and
   timestamps you type by hand into dates or numbers the app cannot read.
4. Paste each row below into cell **A1** of its tab (they are tab-separated, so
   they fill one cell per column). The app refuses to read or write if row 1
   does not match exactly.

**Contractors** (A1 to P1):

```
contractor_id	record_type	created_at	name	primary_trade	service_areas	availability_status	earliest_start_date	phone	consent_version	consent_text	consent_timestamp	availability_reported_at	last_availability_confirmed_at	deletion_requested_at	founder_notes
```

**Requests** (A1 to Q1):

```
request_id	record_type	created_at	developer_name	contact_phone	description	trade	service_area	start_date	duration_days	notes	extraction_source	consent_version	consent_text	consent_timestamp	status	founder_notes
```

**Outcomes** (A1 to O1):

```
outcome_id	record_type	request_id	contractor_id	recorded_at	updated_at	message_sent	contact_attempted_at	contractor_reply	replied_at	response_minutes	match_usable	usefulness_rating	failure_reason	job_started
```

5. Click **Share**, add the service account's email as **Editor**, untick
   "Notify people", and make sure General access stays **Restricted**. Never
   share the Sheet with anyone else or make it public: it holds phone numbers.

### 3. Secrets

Copy `.env.example` to `.env.local` and fill it in. `.env.local` is ignored by
Git. Variables (all server-side only):

| Variable | Purpose |
|---|---|
| `GOOGLE_AUTH_METHOD` | How the app signs in to Google. Empty or `key`: with the service account's private key (below). `impersonation`: keyless, for local use (see "Keyless local sign-in"). Any other value is refused. |
| `GOOGLE_SHEET_ID` | The long ID in the Sheet's web address. |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | The service account's address (`client_email` in a JSON key). Needed for both methods. |
| `GOOGLE_PRIVATE_KEY` | Key method only: `private_key` from the JSON key, in double quotes, on one line, keeping the `\n` markers. **Must be empty** with `impersonation`, or the app refuses to start. |
| `GEMINI_API_KEY` | From Google AI Studio. On the unpaid tier Google may use prompts to improve its products and people may review them, so it is used only with made-up test text (see `GEMINI_MODE`). |
| `GEMINI_MODEL` | Optional. Defaults to `gemini-3.5-flash-lite`. Set it if that model is retired. |
| `GEMINI_MODE` | Empty = Gemini off (normal). `synthetic-tests` = the founder may try AI reading (while logged in as admin) and AI drafting for TEST records, with made-up text only. Ignored whenever the record type is REAL: real requests are always entered by hand and real messages always use the fixed template. |
| `ADMIN_PASSWORD` | 10+ characters. Without it the admin area stays locked. |
| `ADMIN_SESSION_SECRET` | 32+ random characters, different from the password. |
| `TEST_CONTACT_PHONE` | Your own mobile number, used so TEST records never reach a real contractor. |
| `REGISTRATION_RECORD_TYPE` | Leave empty while developing. `REAL` is honoured only by a production build (and, on Vercel, only the Production deployment). |

### Keyless local sign-in (when key creation is blocked)

Some organisations (for example a school's Google account) forbid
service-account keys. The app can instead **act as the service account using
your own Google sign-in on this computer**, with short-lived passes and no key:

1. In the service account's project, enable the IAM Service Account Credentials
   API (`iamcredentials.googleapis.com`), and give your own Google account the
   **Service Account Token Creator** role on that one service account only.
2. Install the Google Cloud CLI and sign in once for local programs (a browser
   window opens; choose the account that has the role):

   ```bash
   gcloud auth application-default login --impersonate-service-account=YOUR-SERVICE-ACCOUNT-ADDRESS
   ```

   This saves a sign-in file in your Windows user folder (outside the project).
   Never open, share or commit it.
3. In `.env.local` set `GOOGLE_AUTH_METHOD=impersonation`, `GOOGLE_SHEET_ID`,
   and `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and leave `GOOGLE_PRIVATE_KEY` empty.
   Restart `npm run dev` after changing `.env.local`.

Safeguards built in: before the first Sheet request the app checks that the
identity Google will use **is exactly** `GOOGLE_SERVICE_ACCOUNT_EMAIL`. If the
computer is signed in as a person, or as any other account, or not at all, it
refuses (the page shows "not set up" or "unavailable") and never touches the
Sheet. Failures are logged only as a short label, plus Google's numeric status
when there is one, for example `[sheets] sheets_request_failed status=403`.

Limits: this works **only on a computer with that sign-in** (it does not work
on a hosting service such as Vercel, which would need a separate keyless setup
called Workload Identity Federation). If the sign-in expires, run the command in
step 2 again.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000. Everything created locally is labelled **TEST**.

### 5. One-time Sheet setup for the newer tabs

Newer features keep their data in **new tabs**, so the original Contractors,
Requests and Outcomes tabs and their headers stay exactly as they are. A new tab
must exist in your Sheet before its feature can save anything. Until then the
app keeps working and shows a notice where the feature would appear.

```bash
npm run sheet:setup             # report only: changes nothing
npm run sheet:setup -- --apply  # create the missing tabs and their header rows
```

The setup only **creates** missing tabs. It never edits, clears or deletes an
existing tab, and it reports (without changing) any existing tab whose headers
differ. Tabs defined so far: `Confirmations` and `Languages`.

## Using it for the experiment

1. Register contractors (`/register`) only **after they consent**.
2. Enter or receive developer requests (`/request`).
3. Log in at `/admin`, open a request, review the potential matches.
4. **Prepare a message**, edit it, tick that you read it, open the WhatsApp link,
   and press send yourself.
5. **Record outcome** afterwards: only what you know. Opening the link is not
   recorded as sent; a reply is not confirmed availability.

## Start dates and availability confirmations

**Flexible start dates.** A contractor registers as "available now" or
"available from a date". Matching keeps trade and locality exactly as required
and treats only the date flexibly:

| Contractor's stated start vs the requested date | Result |
|---|---|
| "Available now", or from a date on or before the requested date (including 1 or 2 days before) | Matches. Ranked first. |
| 1 day after | Shown, labelled **Start date needs confirmation**, ranked after exact-date contractors |
| 2 days after | Same label, ranked after the 1-day group |
| 3 or more days after | Left out ("cannot start within 2 days of the requested date") |
| "From a date" but no usable date on record | Shown only as **Start date needs confirmation**, ranked last |

Ranking is applied **before** the five-candidate display limit, so a near-date
contractor can never push an exact-date contractor off the list. Stale
registrations, missing consent and deletion requests still exclude as before.
(Because a contractor gives one date, "from 25 Oct" is read as able to start on
26 Oct, as before. This rule is in `lib/match.ts`; the constant
`START_FLEX_DAYS` sets the 2-day window.)

**Confirmations belong to one request.** On a request's page, each potential
contractor has a "Record what they said about this request" form, for after you
speak to them. It stores one of: awaiting response; interested, availability
unconfirmed; available for the requested date; available for an alternative
date (with that date); unavailable. Every change is a **new row** in the
`Confirmations` tab (who recorded it, when, and the note), so the tab is an audit
trail; the latest row for that request and contractor is the current status.

- Only "available" statuses with a date inside the 2-day window count as
  confirmed. Awaiting, interested-only and unavailable never do.
- A confirmation for one request is never reused for another request.
- Sending a message, opening a link or a reply does **not** create a
  confirmation: only you record it.
- Only a current potential match can be given a confirmation, so a
  confirmation can never rescue a trade or locality mismatch.
- The older `last_availability_confirmed_at` column is a general contractor-level
  freshness date. It does **not** confirm a start date for any request.

## Languages (English, Hindi, Marathi)

Both public screens, the contractor registration (`/register`) and the developer
request (`/request`), can be used in **English, Hindi (हिन्दी) or Marathi (मराठी)**.
A selector with three large buttons sits near the top of each screen. A link can
open a screen in a language directly, for example `/register?lang=mr`, which is
handy to put in a WhatsApp message. The choice is also remembered on that phone.

**What is translated, and how.**

| Item | How | Needs a service? |
|---|---|---|
| Headings, instructions, labels, buttons, success and error messages | Written translations in `lib/i18n.ts` | No |
| Validation messages (for example "Please enter a valid date.") | Looked up by exact wording, so the rules and their tests are unchanged | No |
| Trade, locality and availability choices | The label is translated; the value stored underneath stays English, so matching still works | No |
| Known Pune localities typed in Hindi/Marathi (बाणेर, कोथरूड ...) | Stored with the English spelling (Baner, Kothrud ...) so matching compares one spelling. Any other locality is kept exactly as typed. | No |
| **Free text a person types** (the request description, notes) | **Kept exactly as written. An English version exists only if a real translation provider produced it.** | **Yes, and none is connected** |

**Free text is not translated yet, and the app says so.** No free, permitted
translation method is available: the Gemini key is on an unpaid tier where text
may be reviewed and used by Google, so real people's text must not be sent to it,
and a paid service needs your approval first. So a Hindi or Marathi description
is saved as written and marked **pending**; the English field stays empty. The
app never copies untranslated text into the English field and never labels it
English. (Devanagari text typed on the English form is also not treated as
English.) A later provider is added by implementing the small `TranslationProvider`
interface in `lib/translation.ts`, after cost and privacy are approved.

**Where it is stored.** The `Languages` tab (new, so your existing tabs are
untouched) gets one row per registration and per request:
`preferred_language` (the language the form and the consent were shown in, also
the language for messages to that person), `source_language`, `original_text`,
`english_text`, `original_notes`, `english_notes`, `translation_status`
(`not_needed`, `pending`, `translated`, `failed`) and `translation_method`.
The original text also stays in the Requests tab exactly as before. If the
Languages tab is missing, a registration or request is still saved; only the
language record is skipped (the reply to a request then says
`language.saved: false`, and a short label is logged). Create the tab with
`npm run sheet:setup -- --apply`.
On a request's admin page you see the language chosen, the translation status,
and the English version only if one really exists.

**Consent.** The consent a person reads is shown in their language, followed by
the **English wording, which is the wording recorded** (with its version). The
consent versions and recorded text are unchanged.

> **Have the Hindi and Marathi wording checked by native speakers**, especially
> the two consent texts, before real contractors or developers rely on it. It was
> drafted for this project and has not been reviewed.

**Adding another language.** Add it to `LANGUAGES` in `lib/language.ts` and add
one more dictionary in `lib/i18n.ts`. The project will not build until every
string exists, and the tests check the new language the same way.

**Known limits.** The admin pages are in English. Names are never translated.
Notes and descriptions typed in Latin letters on the Hindi/Marathi form (for
example "Hinglish") are not assumed to be English either, so they also stay
pending. Messages to contractors are not translated yet (WhatsApp is a later
phase).

## Manual procedures (no screens for these yet)

- **Delete a contractor / honour a deletion request:** put the date in
  `deletion_requested_at` (matching then ignores them immediately), then delete
  the row. Google keeps version history, so clear it too. Do the same for their
  rows in `Requests` if they asked. `Outcomes` rows hold only IDs.
- **Mark availability as confirmed:** after you speak to a contractor, type the
  date and time (for example `2026-10-21T15:30:00+05:30`) into
  `last_availability_confirmed_at`. Evidence older than 14 days is treated as
  stale and the contractor stops matching until it is refreshed.
- **Several service areas:** separate them with a semicolon (`Baner; Wakad`). A
  comma stays inside one locality name.
- Edit the Sheet by hand with care: the app trusts what is in it.

## Checks

```bash
npm run lint
npm run build
npm test
```

`npm test` runs the automated tests in `tests/` using Node's built-in test
runner. It needs **no extra packages**, no internet, and no credentials: all
data is made up, and Google Sheets and Gemini are replaced by pretend versions
(`tests/helpers/fakes.mjs`). A small helper (`tests/loader.mjs`) lets Node read
the app's TypeScript files directly.

What the tests cover: registration validation and consent, dates and Indian
phone numbers, TEST/REAL separation, request reading and bad model output,
matching (area/trade/availability/stale/no match), WhatsApp link encoding and
manual-only contact, outcome calculations and empty dashboards, the admin
login and its guards, the API routes, rate limiting, and the security headers.

What they do **not** prove: that the real Google Sheets or Gemini connections
work. Only a test with real credentials can show that (see "Before any
deployment").

## Security headers

Every response carries: a Content-Security-Policy, `X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a Permissions-Policy
that turns off camera/microphone/location/payment/USB, and (production builds
only) `Strict-Transport-Security`. They are defined in
`lib/security-headers.ts` and applied in `next.config.ts`.

Trade-offs, plainly: Next.js puts small inline scripts in each page, so the
policy has to allow `'unsafe-inline'` scripts. A stricter policy using a fresh
secret "nonce" per request would force every page to be rebuilt for every
visitor. So the policy blocks framing, other sites' forms and plugins, `<base>`
tricks and any outside connection or asset, but it is **weaker against injected
scripts** than a nonce-based policy. Development additionally allows
`'unsafe-eval'` and websockets (live reload). These headers help; they do not
make the application secure by themselves.

## Rate limiting (what exists and its limits)

| Endpoint | What it can do | Limit now |
|---|---|---|
| `POST /api/requests/extract` | Calls Gemini (costs quota) | 5 per 10 min per address |
| `POST /api/requests` | Creates a record | 10 per 10 min per address |
| `POST /api/contractors` | Creates a record | 10 per 10 min per address |
| Admin login | Password guessing | 5 per 10 min per address |
| Admin "draft message" | Calls Gemini (admin only) | 10 per 10 min, shared |

These counters live in each server instance's memory. On hosting that runs
several instances (such as Vercel) they are **not shared and reset on restart**,
so they are only a speed bump, not reliable protection. The caller address comes
from `x-forwarded-for`, which is only trustworthy behind a proxy that sets it
(Vercel does; confirm this when deploying). The smallest real next steps need
no new code: set a hard quota and budget alert on the Gemini key, and use the
hosting platform's own rate-limit or firewall rules if available (check their
price first). A shared counter (a database or key-value store) would be the code
fix, and is a new service to approve.

## Before any deployment (not done; needs your approval)

- Put the code in a **private** GitHub repository (this folder is not a Git
  repository yet) and confirm `.env.local` and any key file are not committed.
- Create the hosting project and enter the environment variables in its
  dashboard. Set `REGISTRATION_RECORD_TYPE=REAL` **only** for the Production
  scope, and only when the consent wording is final and reviewed.
- Add stronger rate limiting and a spend cap on the Gemini key (see "Rate
  limiting"), and review the consent text and your data-protection
  duties (India's DPDP Act) with a qualified person. This README is not legal
  advice.
- Test the whole flow once with real Google and Gemini credentials using TEST
  records before any real person is involved.

## Limitations and unfinished work

- **Never tested against real Google or Gemini.** All Sheet and Gemini behaviour
  was tested with simulated services. Real model drafts may be rejected more or
  less often than in tests, and the default model name may need updating.
- Keyless (`impersonation`) sign-in works only on a computer signed in with the
  Google Cloud CLI; a hosted deployment needs Workload Identity Federation,
  which is not built.
- The automated tests use pretend Google and Gemini; nothing has been tested
  against the real services or in a real deployment.
- Gemini's suggested locality is checked only for shape (letters, up to 60
  characters), not that it is a real Pune locality; a person reviews it.
- No screens to edit or delete records, confirm availability, or manage
  deletion requests (manual, see above).
- Public forms (`/register`, `/request`) are protected only by validation, a
  hidden spam field and an in-memory rate limit that is weak on serverless
  hosting. `/api/requests/extract` costs a Gemini call per use.
- Registration and request endpoints allow 10 submissions per 10 minutes per
  address, which could slow down registering many contractors from one phone or
  network.
- The admin login is one shared password with a simple in-memory attempt limit.
- The Content-Security-Policy allows inline scripts (see "Security headers"),
  and it could not be confirmed in the test browser that `eval` is blocked.
- Two simultaneous registrations with the same number could both be saved.
- Matching ignores job size, duration and budget, and treats nearby localities
  as different places. It cannot know if a contractor's situation changed.
- The dashboard's 5-data-point threshold is a cautious rule, not a statistical
  guarantee: a handful of outcomes proves very little.
- Whether a message was sent is only what you report; the app cannot see
  WhatsApp.
- Consent wording was written by the developer of this tool and is unreviewed.
- Default Next.js sample images remain in `public/` (unused).