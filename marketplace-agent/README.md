# AI Marketplace Sales Agent

An AI sales agent for Facebook Marketplace. You give it a product; it writes the
listing, publishes it through the normal Facebook website in a real browser,
answers buyers, negotiates down to (never below) your minimum price, and hands
the conversation to you the moment a buyer is ready to buy.

There is **no Facebook API integration**. Everything happens through the regular
website UI, driven by Playwright, in a browser on your machine that **you** log
into.

---

## Quick start

```bash
npm install
cp .env.example .env        # optional: add ANTHROPIC_API_KEY

# terminal 1 - the web dashboard
npm run dev                 # http://localhost:3000

# terminal 2 - the agent (fake marketplace, nothing touches Facebook)
npm run mock-agent
```

Then open <http://localhost:3000>, click **+ Add Product**, fill the form and
press **Start Selling**.

To drive the real thing instead of the mock:

```bash
# terminal 2
MARKETPLACE_MODE=facebook npm run agent
```

Click **Open Facebook Browser** in the dashboard, log in yourself in the window
that appears, then press **Start Agent**.

### Verify it works

```bash
npm run build                      # the UI and e2e suites run against a production build
npm test                           # rules, challenge detection, recovery, linking, dashboard lock
npm run test:ui                    # every page renders, edits save, hot leads notify
npm run e2e                        # the whole MVP flow, in a real browser
npm run test:claude                # live Claude checks (skips itself without a key)
```

| Suite | What it proves |
|---|---|
| `test:rules` | the minimum price can never be crossed (checked against every offer/anchor combination); the guard blocks addresses, payment apps, phone numbers, shipping; lead bands and buyer classification |
| `test:facebook` | login pages, checkpoints, CAPTCHAs and 2FA prompts are recognised and *paused on*, never bypassed |
| `test:recovery` | a broken marketplace UI produces a screenshot, an HTML snapshot, a FAILED status and a working retry — and publishes nothing |
| `test:linking` | a thread is attached to the right product even when two listings share a title and the inbox hides the listing id; re-syncing never duplicates messages; marking sold takes the listing down on the marketplace |
| `test:auth` | with `DASHBOARD_TOKEN` set, no page or API call works without it |
| `test:ui` | all pages render with no console errors, edits persist, deleting a live listing is refused, a new hot lead fires a notification |
| `e2e` | product → Claude draft → approval → browser publish + verification → buyer messages → negotiation floor → HOT_LEAD handoff → AI stops → sold on the marketplace → edit and delete |
| `test:claude` | with a real key: Claude's listing copy invents nothing, its classifications match the spec's examples, and every reply it writes passes the guard |

CI runs all of this on every push (`.github/workflows/marketplace-agent.yml`). Add an
`ANTHROPIC_API_KEY` repository secret to include the live Claude suite.

---

## How it is put together

```
src/
  app/               Next.js dashboard + JSON API
  db/                SQLite schema and typed repository
  ai/                Claude services (never touches the browser)
    listingGenerator.ts   rewrites your listing copy
    messageAgent.ts       decides and sends the next reply
    leadClassifier.ts     buyer status + 0-100 lead score
    negotiationAgent.ts   applies your price rules
    pricing.ts            the price floor, in code
    safety.ts             last-line guard on every outgoing message
    tools.ts              the only actions the AI can take
  automation/
    MarketplaceAdapter.ts     the interface both backends implement
    facebook/                 ALL Facebook-specific browser logic
    mock/                     fake marketplace website + its adapter
  agent/worker.ts      the process that owns the browser
scripts/               tests and the buyer simulator
```

**The AI decides *what* should happen; Playwright decides *how*.** Claude never
gets browser access. It receives structured data from `src/ai/tools.ts` and asks
the application to act; the application re-checks every rule before touching the
browser.

The web UI never drives the browser either. It writes commands to a SQLite
table and the agent process executes them, which keeps the Facebook session in
one place on your machine.

### Real mode vs mock mode

Both implement the same `MarketplaceAdapter` interface:

| | Real | Mock |
|---|---|---|
| Backend | facebook.com | a fake marketplace on `localhost:4010` |
| Browser | persistent Chromium profile, **headed** | Chromium, headless |
| Start with | `MARKETPLACE_MODE=facebook npm run agent` | `npm run mock-agent` |

The mock marketplace is a real website with a real create-listing form and a
real chat UI, driven by a real browser — so publishing, messaging, negotiation,
lead scoring and handoff are all exercised end to end without going near
Facebook.

Send a buyer message into the mock while it is running:

```bash
npx tsx scripts/simulate-buyer.ts item2 "John" "Would you take \$350?"
```

---

## Safety rules

These are enforced in **code**, not by prompting, and every outgoing message is
re-checked by `src/ai/safety.ts` immediately before it is typed into the browser.
If Claude produces something that breaks a rule, it is discarded and a safe
deterministic message is sent instead (and the block is written to the event log).

- Never accepts or quotes a price below a product's minimum.
- The model may raise its read of buyer intent but never lower a concrete
  signal: a buyer who named a price is negotiating, and one who said they will
  take it is a hot lead, whatever the model thinks.
- Never gives out an exact street address — it promises a human will confirm
  pickup details, then flags the lead for you.
- Never invents specifications, condition or history. Claude may only rephrase
  what you wrote, and generated copy is flagged if it adds claims you did not make.
- Never sends payment details, phone numbers, email addresses, or offers shipping.
- Stops replying to a conversation as soon as it becomes a `HOT_LEAD`, until you
  explicitly switch AI back on for that conversation.
- **Never reports an action as done unless it verified it in the browser.**
  A publish is only `ACTIVE` after the listing is found and read back; a reply is
  only recorded after it is found in the thread.

### Login and security challenges

- You log into Facebook yourself, in the browser window the agent opens.
- If you expose the dashboard beyond your own machine, set `DASHBOARD_TOKEN`:
  the agent can message buyers as you, so the UI and API should not be open.
- Your password is never requested, stored, or transmitted by this app.
- The session lives on your machine in `data/browser-profile` (Playwright
  persistent context). Delete that folder to sign out.
- CAPTCHAs, MFA, checkpoints and rate limits are **never** bypassed. When one is
  detected the agent pauses and the dashboard says:
  *"Facebook requires manual verification. Complete it in the browser, then
  resume the agent."*

### When the UI does not match

The agent never clicks blindly. If an expected element is missing it:

1. takes a screenshot, 2. saves an HTML snapshot, 3. records the failing step,
4. stops the action, 5. shows the error in the dashboard with a **Retry action**
button.

Screenshots and snapshots land in `data/debug/`. Every Facebook selector lives in
`src/automation/facebook/selectors.ts` — if Facebook changes its UI, that file
(and its siblings in that folder) is the only place you need to edit.

---

## Negotiation

Each product has an asking price and a minimum price. The ladder is computed in
code (`src/ai/pricing.ts`); Claude only phrases the result.

With asking `$450` and minimum `$400`:

| Buyer | Agent |
|---|---|
| "Would you take $350?" | "I can't go that low, but I can do **$425** if you can pick it up today." |
| "$400?" | "**$400** works if you can pick it up today. I'll have the seller confirm the pickup details with you." |

Each round concedes about halfway toward the floor, then holds at the floor.
Once the buyer agrees to anything at or above the minimum the conversation
becomes `HOT_LEAD`, the AI switches itself off for that thread, and the dashboard
shows **🔥 READY TO CLOSE** with `OPEN CHAT` / `TAKE OVER` / `MARK SOLD`. The
handoff is recorded *before* the closing message is written, so the dashboard is
never briefly showing a hot lead with the AI still apparently in charge.

If you allow notifications (Settings → Notifications), a new hot lead raises a
desktop notification and a chime, so you do not have to be watching the tab.

**MARK SOLD takes the listing down on the marketplace too**, not just in this
database — the agent opens the listing and marks it sold, and only reports
success once it re-reads it as sold. If the agent process is not running, the
dashboard says so rather than pretending the listing is gone.

Lead scores: `0-30` LOW_INTENT · `31-60` INTERESTED · `61-80` NEGOTIATING ·
`81-100` HOT_LEAD.

---

## Claude

Set `ANTHROPIC_API_KEY` in `.env` to have Claude write the listing copy and the
buyer replies. Without a key **the agent still runs end to end** — it uses your
own wording and the same deterministic price rules, so you can develop and test
the whole system offline.

`ANTHROPIC_MODEL` defaults to `claude-sonnet-5`.

---

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | – | enables Claude-written copy and replies |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | model id |
| `MARKETPLACE_MODE` | `mock` | `mock` or `facebook` |
| `HEADLESS` | – | `1` forces headless, `0` forces headed. Facebook defaults to headed, mock to headless |
| `POLL_INTERVAL_MS` | `15000` | how often the agent re-reads the inbox while running |
| `MOCK_PORT` | `4010` | fake marketplace port |
| `DASHBOARD_TOKEN` | – | if set, the dashboard and its API require this token (entered once at `/unlock`, or sent as `x-dashboard-token`) |

Data (SQLite database, uploaded photos, browser profile, debug snapshots) all
lives under `data/`, which is git-ignored.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | the dashboard |
| `npm run agent` | the agent process (mode from `MARKETPLACE_MODE`) |
| `npm run mock-agent` | fake marketplace + agent, all in one |
| `npm run mock-server` | just the fake marketplace |
| `npm run e2e` | the full MVP flow (needs `npm run build` first) |
| `npm run db:reset` | wipe the local database |
| `npm test` | the offline suites |
| `npm run test:claude` | live Claude checks (needs a key) |
