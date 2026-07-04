# Ledger — AI reconciliation agent for Xero

> This file is the source of truth for the build. Read it fully before writing any code.
> Re-read the "Scope discipline" and "Build order" sections before starting each new stage.

---

## 1. What we're building (one paragraph)

Ledger is an AI agent that watches a Stripe account and reconciles its activity into Xero
automatically — matching each payment to the right open invoice, splitting out the Stripe
processing fee so the books balance, and flagging the cases it can't confidently resolve
(partial payments, unknown senders, duplicate webhooks) into a human review queue instead
of guessing. The pitch: Puzzle rebuilt accounting from scratch to escape manual
reconciliation, but that means leaving the ledger 4.4M businesses already use. Ledger brings
that same automation *to* Xero as an agent layer — including the messy cases Xero still makes
you click through by hand.

This is a hackathon build. Optimise for a working, beautiful, demo-able product by the
Sunday 13:00 deadline — NOT for completeness or production hardening beyond what the demo shows.

---

## 2. The hackathon — context that shapes every decision

**Event:** Encode Club × Xero — "Build AI-Powered Apps & Agents powered by Xero", London, 4–5 July 2026.
**Track:** Track 2 — "The Vibe Integrator": *best integrator or workflow-automation tool that
uses an agent to monitor a second app and intelligently syncs the data into Xero.* (£3,000)
**Hard rule:** the hack MUST integrate with the Xero API. Non-negotiable.
**Submission deadline:** Sunday 13:00 BST. Submission Q&A due 11:00 Sunday.

### Judging criteria — build to these weights
- **50% — Xero connection:** a *real problem*, solved with *strong* use of Xero. THIS IS THE BIG ONE.
  Every feature must visibly lean on Xero. Real matching, real writes, real fee handling.
- **30% — API integration:** effective use of the Accounting & Payments APIs.
- **20% — Architecture:** reliable, production-ready design. (This is where duplicate-detection,
  idempotency, rate-limit handling, and clean error states earn their points.)

### What we must be able to answer at submission (required Xero questions)
Keep a running note in `SUBMISSION.md` as we build, filling these in:
1. How did the project use the Xero API? (core workflow — reconciliation)
2. Which Xero API endpoints + methods did we use? (e.g. GET /Invoices, GET /Payments,
   POST /Payments, POST /BankTransactions, GET /Contacts)
3. Which OAuth 2.0 scopes did we need? (accounting.transactions, accounting.contacts,
   accounting.settings, and the payments/reports scopes the MCP server grants)

Also required for submission: project description, dev platform used (Claude Code), link to
a presentation (Google Slides/Canva), and a demo video (recommended).

### The differentiation — why we beat the "dumb pipe" entries
Most Track 2 entries will be "Stripe payment in → create Xero invoice out." That's a pipe;
Zapier does it with no agent. Our edge is what the agent DECIDES in the middle:
- **Match, don't create** — find the *existing* open invoice a payment settles.
- **Split fees** — the £100 invoice vs £97.10 deposit problem, booked as an expense line.
- **Flag the mess** — partial payments, unknown senders, duplicates → review queue, not a guess.
State this out loud in the UI copy and the pitch. The intelligence is the product.

---

## 3. The demo scenario — this IS the script (build the mock around it exactly)

Six incoming Stripe payments, ordered as a narrative arc (easy win → known pain → smart save → wow):

| # | Customer | Amount | Outcome | What it proves |
|---|----------|--------|---------|----------------|
| 1 | Northwind Café | £420.00 | Clean match → INV-1042 marked paid | The agent works (happy path) |
| 2 | Brightside Studio | £1,200.00 | Matched INV-1051; £34.80 Stripe fee → expense; deposit £1,165.20 reconciles | Fee handling — the pain judges know |
| 3 | Harbour Goods | £315.50 | Clean match → INV-1039 marked paid | Reliability — not a one-off fluke |
| 4 | Meadow & Co | £500.00 | Partial payment of INV-1047 (£850) → flagged for review | Handles ambiguity |
| 5 | Unknown sender | £90.00 | No reference, no matching invoice → flagged | Automates the human "Find & Match" step |
| 6 | Northwind Café | £420.00 | Duplicate webhook (identical to #1) → detected + skipped | Production-ready (architecture score) |

Ratio is deliberate: 3 clean (trust) + 3 messy (intelligence). Do not change amounts, customers,
or invoice numbers without updating this table AND the mock data AND SUBMISSION.md.

**Optional 7th case if time allows:** Overpayment — customer pays £450 on a £420 invoice; agent
marks paid and flags the £30 as a credit. Only add after all 6 above work end-to-end.

---

## 4. The Xero connection — how the real integration works

**We are building against a MOCK Xero layer first, then swapping to the live MCP server.**
Reason: the developer's Xero account creation is currently erroring on Xero's side (they're
fixing it / can be unblocked via a Xero staffer or the hackathon Discord). We do not wait on
that to build. Architect so the swap is a one-file change.

### Connection facts (for when the live account is ready)
- **MCP endpoint:** `https://builders.xero.com/beta/mcp`
- **Auth:** OAuth 2.0 PKCE. Create a PKCE app at https://developer.xero.com/app/manage,
  copy the Client ID, submit it to the allow-list form (until allow-listed, every call is
  403 Forbidden — expected, not a bug).
- **Connection tool: Claude Code CLI path.** Register redirect URI
  `http://localhost:3000/callback` on the Xero app, then:
  ```
  claude mcp add \
  --transport http \
  --client-id <YOUR-CLIENT-ID> \
  --callback-port 3000 \
  xero-mcp https://builders.xero.com/beta/mcp
  ```
  Then `/mcp` → select `xero-mcp` → Authenticate → pick the Demo org → Allow access.
  NOTE: Xero does NOT support the `127.0.0.1` loopback some tools auto-generate — use the
  explicit `localhost:3000/callback` above.
- **Scopes granted:** OpenID/profile/email + accounting scopes (invoices, contacts, bank
  transactions, payments, settings, reports) — read AND write.
- **Verify connection:** ask the MCP "list my invoices" or "what's my profit and loss this month?"

### RATE LIMITS — respect these in the architecture (this is 20% of the score)
- 60 calls/min, 1,000 calls/day per org, 5 concurrent max. 429 = backed off, retry.
- **Never live-loop the API per payment.** Pull invoices/contacts ONCE into a local cache,
  run all matching against the cache, and write back only the results. Build a thin caching
  layer early. This is both correct engineering and a talking point for the architecture score.

---

## 5. Architecture — keep the mock/live swap trivial

```
/app                Next.js App Router (frontend)
/lib
  /xero
    types.ts        Shared TS types matching Xero's API shapes (Invoice, Payment, Contact, BankTransaction)
    provider.ts     interface XeroProvider { getInvoices(), getContacts(), markPaid(), createFeeExpense(), ... }
    mock.ts         MockXeroProvider — returns the demo scenario data (section 3), same shapes as live
    live.ts         LiveXeroProvider — calls the Xero MCP / API (built second, once account is live)
    index.ts        exports the active provider; switch mock↔live via env var XERO_MODE=mock|live
  /agent
    reconcile.ts    The core agent logic: takes a payment + cached Xero state → returns a Decision
    decision.ts     Decision types: MATCH | FEE_SPLIT | PARTIAL | NO_MATCH | DUPLICATE
    match.ts        Matching logic (amount + customer + reference; fuzzy fallbacks)
  /stripe
    types.ts        Stripe payment/charge/fee shapes
    mock.ts         The six demo payments (section 3), Stripe-shaped
```

**The golden rule of the swap:** the agent and the UI only ever talk to the `XeroProvider`
interface. `mock.ts` and `live.ts` are interchangeable. When the account unblocks, we implement
`live.ts` and flip `XERO_MODE`. Nothing in `/agent` or `/app` changes.

**Idempotency:** every processed Stripe payment gets recorded (by Stripe charge id / payment id).
Re-processing a seen id → returns DUPLICATE without writing. This is what makes case #6 work and
what earns the architecture score. Do this properly, not as a demo hack.

---

## 6. The agent logic — what "intelligent" means here

For each incoming Stripe payment, `reconcile.ts` decides:

1. **Seen before?** (charge id in processed set) → `DUPLICATE`, skip write.
2. **Match to an open invoice** by: exact amount + customer name/contact + invoice reference in
   the Stripe metadata. If exact single match → `MATCH`.
3. **Amount < invoice total** for an otherwise-good match → `PARTIAL` → flag (don't mark fully paid).
4. **Stripe fee present** (gross vs net differ) on a clean match → `FEE_SPLIT`: mark invoice paid
   for the gross, book the fee delta to an expense account (bank transaction / spend money).
5. **No confident match** (no reference, no amount/customer hit) → `NO_MATCH` → flag to review queue.

Each Decision carries: the payment, the matched invoice (if any), the fee amount (if any), a
confidence, and a human-readable reason string (shown in the UI + used in the flag queue).
Keep the reason strings crisp — they're demo copy.

---

## 7. The frontend — "the UI has to eat"

The developer is a frontend engineer; the UI is a competitive advantage. Most entries will be an
ugly default dashboard. Ours must look intentional and be genuinely interactive. BUT: interactivity
must serve the reconciliation story, never decorate. No spinning globe for its own sake.

### Aesthetic — dark editorial (the developer's signature look)
- Palette: near-black `#0a0a0a` background, acid-green accent `#c8ff00`, off-white text `#f5f0e6`.
- Semantic colours: matched = teal `#1d9e75`, fee = amber `#eda100`, flagged = coral `#d85a30`.
- Type: `Space Grotesk` (headings), `Space Mono` (data/labels/numbers).
- Flat, high-contrast, generous negative space. No gradients-as-decoration, no drop-shadow soup.

### The hero: a Three.js reconciliation flow (this is the centrepiece)
A live 3D canvas that shows the agent working, mapped exactly onto the six demo payments:
- Each Stripe payment enters from the left as a labelled node.
- On "Run agent", each payment travels along a connector line toward the invoice column on the right.
- **Clean match:** the payment node snaps onto its invoice node; both pulse teal; a "paid" tick appears.
- **Fee split:** as the payment moves, a smaller node branches off (amber) and peels away to an
  "expenses" lane — visually showing the fee being separated.
- **Partial:** the payment reaches the invoice but only fills part of it (a partial fill bar), then
  drifts to the review lane pulsing coral.
- **No match:** the payment finds no target, slows, and drifts down into the review lane, coral.
- **Duplicate:** the payment appears, is recognised (flashes), and dissolves before it moves —
  labelled "duplicate · skipped".
Motion should be smooth and legible (ease in/out, ~0.6–0.8s per payment, staggered). The judge
should be able to READ the flow, not just see particles. Legibility > spectacle.

Implementation notes:
- Use `three` (r128-compatible APIs — do NOT use CapsuleGeometry; use Cylinder/Sphere/Box).
- Keep it performant: 6 payments + ~6 invoices is tiny; no need for instancing. 60fps easily.
- Provide a subtle idle state (nodes gently float) before "Run agent" is pressed.
- Pair the 3D with a readable data layer beneath it (the dashboard rows + stat cards) so nothing
  depends on the animation alone — judges need the numbers too.

### The dashboard (readable layer, beneath/beside the 3D)
- Top stat row: Incoming / Reconciled / Fees split / Flagged (live counters that tick up as the
  agent runs).
- Payment list: one row per payment, status transitions from "Pending" → its outcome with the
  reason string, colour-coded by outcome.
- A "Review queue" panel: the three flagged items, each with the agent's reason and a
  (mock) "Approve / Reassign" action — shows the human-in-the-loop step that incumbents leave manual.

### Interactivity beyond the run
- Clicking a flagged item expands the agent's reasoning (why it couldn't auto-resolve).
- A "replay" control to re-run the flow for repeat demos.
- Everything must survive being demoed live on a projector: high contrast, large type, no tiny text.

---

## 8. Build order — NEVER skip ahead; each stage must demo end-to-end before the next

> Rule: do not start a stage until the previous one runs and demos cleanly. Three shallow
> half-features lose to two that visibly work. Commit at the end of every green stage.

**Stage 0 — Scaffold + mock provider + types.**
Next.js app, the `/lib` structure above, `types.ts`, `MockXeroProvider` returning the demo data,
the six Stripe-shaped mock payments. A trivial page that lists them. Green = data renders.

**Stage 1 — The agent + happy path (MOST IMPORTANT — this is a valid submission on its own).**
`reconcile.ts` handles MATCH. Wire the dashboard rows + stat counters. Payment #1 and #3 match
and mark paid (against the mock). Green = clean matches work end-to-end in the UI.

**Stage 2 — Fee split.**
Add FEE_SPLIT. Payment #2 marks the invoice paid AND books the fee to an expense line in the
mock. Green = the £1,200/£1,165.20/£34.80 case reconciles and shows in the UI.

**Stage 3 — Flagging + review queue.**
Add PARTIAL, NO_MATCH, DUPLICATE. Payments #4, #5, #6 route to the review queue with reasons.
Idempotency store makes #6 a real duplicate-skip. Green = review queue populated correctly.

**Stage 4 — The Three.js hero flow.**
Build the 3D reconciliation animation mapped to all six cases. This is high-value for the demo
but comes AFTER the logic works, because it's the most likely thing to eat time. The dashboard
already tells the whole story without it, so this is upside, not a dependency.

**Stage 5 — Live Xero swap (only if the account is unblocked in time).**
Implement `LiveXeroProvider` against the MCP server; flip `XERO_MODE=live`; verify against the
Demo org. If the account isn't ready, we demo on mock and state "live Xero connection pending
their account fix" — the agent logic and UI are identical either way. Keep this stage isolated
so it can't break the working mock demo.

**Stage 6 — Polish + submission assets.**
Fill SUBMISSION.md (endpoints, scopes, description). Draft the 3-min pitch. Record a demo video.
Tidy copy, check projector legibility, remove console noise.

---

## 9. Scope discipline — things NOT to do

- Do NOT try to be Puzzle (a full replacement ledger). Xero stays the ledger; we're the agent layer.
- Do NOT add a second or third external app (no Gmail, no Shopify). One source: Stripe. The
  "pluggable source" idea is sold in WORDS in the pitch, not built.
- Do NOT build auth flows, user accounts, multi-tenant, or persistence beyond what the demo needs.
- Do NOT use localStorage/sessionStorage in a way that blocks the demo; keep state in memory/React
  unless a tiny JSON store genuinely helps.
- Do NOT over-engineer the live provider before the account exists — mock first, always.
- Do NOT let the 3D animation become a dependency for understanding the demo. Numbers first, 3D on top.
- If something is taking too long, fall back to the last green stage and demo that. A working
  Stage 3 with no 3D beats a broken Stage 4.

---

## 10. Pitch skeleton (draft; refine in Stage 6)

The developer's known weak spot is presentation delivery — lead with a provocation, drop the
killer finding early, use the app as proof not a feature tour, close with implications.

1. **Provocation:** "Puzzle raised millions on one idea — legacy accounting forces you to reconcile
   by hand. Their answer was to replace your ledger. But 4.4 million businesses aren't leaving Xero."
2. **The gap:** "Even Xero's own Stripe feed kicks the messy cases — unmatched payments, fee splits,
   duplicates — back to a human with a 'Find & Match' button."
3. **The product (demo):** Run the agent live. Six payments. Watch it match, split fees, and flag
   the mess — the three cases everyone else leaves manual.
4. **The architecture beat:** duplicate webhook detected and skipped; rate-limit-aware caching.
5. **Implication + vision:** "The source is pluggable — today Stripe, tomorrow Gmail or Shopify,
   same reconciliation engine. We brought Puzzle's automation to the ledger businesses already use."

---

## 11. Definition of done (for the hackathon)
- The six-payment scenario runs end-to-end and demos in under 90 seconds.
- Matches, fee split, and all three flag types are visibly correct in the UI.
- Duplicate detection is real (idempotency store), not faked.
- The UI looks intentional (dark editorial) and has the Three.js hero flow.
- SUBMISSION.md answers the three required Xero questions.
- If the live account is up: it runs against the Demo org. If not: mock demo, honestly labelled.
- A 3-minute pitch and a demo video exist.
