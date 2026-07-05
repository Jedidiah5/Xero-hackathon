# Ledger — 3-minute pitch deck (Canva build sheet)

**Design system (use throughout):** cream background `#f4f0e8`, white cards, ink text
`#1c1915`, gold accent `#c97b24` (brand only — buttons, kickers, the "Ledger." dot).
Semantic colours: teal `#0fa36b` = matched, amber `#d97706` = fee, coral `#e8553a` =
flagged, blurple `#635bff` = incoming. Headings: Space Grotesk Bold. Data/labels:
Space Mono. One idea per slide, huge type, no paragraphs on slides — the speaker
notes carry the words.

Timing plan (3:00): S1 0:15 · S2 0:20 · S3 0:25 · DEMO 1:10 · S6 0:25 · S7 0:15 · S8 0:10.

---

## Slide 1 — The provocation (0:15)

**On slide (huge, centered):**
> Puzzle raised millions to escape manual reconciliation.
> Their answer: replace your ledger.

**Small line beneath (mono):** 4.4 million businesses aren't leaving Xero.

**Speaker notes:** "Puzzle raised millions on one idea — legacy accounting forces you to
reconcile by hand. Their answer was to rebuild the ledger from scratch. But four point
four million businesses aren't leaving Xero. So the automation has to come to *them*."

**Design:** text only. No logo yet. Let the numbers do the work.

---

## Slide 2 — The gap (0:20)

**On slide:**
> Even Xero's own Stripe feed gives up on the messy cases.

**Three mono chips below, coral:** `unmatched payment` · `fee ≠ deposit` · `duplicate webhook`

**Small caption:** …and hands you a "Find & Match" button.

**Speaker notes:** "Xero already has a Stripe feed. But the moment a payment is
ambiguous — the deposit doesn't equal the invoice because Stripe took its fee, the
sender is unknown, the webhook fired twice — it kicks the case back to a human with a
Find & Match button. That manual click is the product gap."

**Design:** screenshot of Xero's Find & Match UI greyed in the background if you have
one; otherwise keep it typographic.

---

## Slide 3 — The product (0:25)

**On slide (title):** Ledger. The reconciliation agent Xero doesn't have yet.

**Three pillars (cards, one per semantic colour):**
- **Match, don't create** (teal) — finds the *existing* open invoice a payment settles.
- **Split the fee** (amber) — £1,200 invoice · £34.80 fee → expense · £1,165.20 deposit reconciles.
- **Flag the mess** (coral) — partials, unknowns, duplicates → a human review queue. Never a guess.

**Speaker notes:** "Ledger is an agent that watches Stripe and reconciles into Xero.
Three decisions make it an agent and not a pipe: it matches payments to the invoices
you already raised — it never invents documents. It splits the Stripe fee so the books
actually balance. And when it isn't confident, it flags instead of guessing. The
intelligence is in what it *refuses* to write."

**Design:** use your landing page's three pillar cards — same copy, same colours.

---

## Slides 4–5 — THE DEMO (1:10) — live app, not slides

Keep one slide up as a backdrop before switching to the browser:

**On slide:** Six payments. Watch the agent decide.
**Mono sub-line:** 3 clean · 3 messy — deliberately.

**Demo choreography (rehearse this exact order):**
1. `/demo` open, idle flow visible. One line: "Six Stripe payments on the left, real
   open Xero invoices on the right."
2. Press **Run agent**. Narrate the arc as rows resolve: "Clean match, marked paid.
   Fee split — invoice paid in full, £34.80 booked to expense, the *net* deposit now
   reconciles. Another clean match. Partial payment — five hundred of eight-fifty —
   flagged, not posted. Unknown sender — flagged. And the duplicate webhook —
   recognised by charge id and skipped. Zero double-booking."
3. Point at the counters: "Six in: three reconciled, one fee split, two for review,
   one duplicate skipped."
4. Click the **/connection** tab: "And this is not a mock-up of Xero — live org, real
   counts, OAuth'd through Xero's MCP server." *(If you ran live mode: "the three
   invoices you just watched go teal are now marked PAID inside the Demo Company —
   open count dropped from fourteen to eleven.")*

**Fallback:** if anything hiccups, the dashboard rows alone tell the full story — keep
narrating from the table, never apologise.

---

## Slide 6 — The architecture beat (0:25)

**On slide (four mono bullets, large):**
- Idempotency by Stripe charge id — duplicate webhooks can't double-book
- 2 reads + 4 writes per run — cache once, never per-payment API loops (60/min budget)
- One `XeroProvider` seam — mock ↔ live is an env var, agent untouched
- Human-in-the-loop review queue — the agent only writes what it's sure of

**Speaker notes:** "Under the hood this is built like a production integration, not a
hack. Every processed charge id is recorded, so the duplicate was caught *before* any
matching or writing ran. A whole six-payment run costs two reads and four writes
against Xero's rate limits. And the agent and UI only ever talk to a provider
interface — we built on a mock while Xero fixed our account, then flipped one
environment variable and the same agent wrote to the real org."

---

## Slide 7 — Strong use of Xero (0:15)

**On slide (two columns, mono):**

| Endpoint | Why |
|---|---|
| GET /Invoices | the matching cache (open ACCREC) |
| GET /Contacts | customer matching |
| GET /Accounts | bank + fee expense codes |
| **POST /Payments** | settle matched invoices — real writes |
| **POST /BankTransactions** | book Stripe fees as spend money |

**Small caption:** via Xero's MCP server · OAuth 2.0 PKCE · accounting.* scopes

**Speaker notes:** "Five Accounting API surfaces, and the two that matter are writes —
verified against the Demo Company: invoices genuinely flip to paid, the fee genuinely
lands in the expense account."

---

## Slide 8 — Close: the implication (0:10–0:15)

**On slide:**
> Today Stripe. Tomorrow Shopify, GoCardless, Gmail.
> Same engine. Same ledger. **Your ledger.**

**Speaker notes:** "The source is pluggable — anything that produces payment events
feeds the same reconciliation engine. Puzzle's automation, brought to the ledger 4.4
million businesses already use. That's Ledger."

**Design:** end on the wordmark: **Ledger.** (gold dot) + `Encode × Xero · Track 2 ·
built with Claude Code` in small mono.

---

## Q&A ammunition (don't put on slides)

- **"Is the Stripe side real?"** — "Stripe-shaped to the byte — amounts in pence,
  balance-transaction fees, charge ids. Simulated for determinism; the ingest is a
  drop-in webhook handler behind the same seam, and duplicate delivery is already
  handled — that's case six. The Xero side is live: watch the invoice flip in the org."
- **"What if it matches wrong?"** — "A match requires reference, amount and contact to
  all agree with exactly one open invoice. Anything weaker is flagged to a human. Its
  failure mode is asking, not corrupting the ledger."
- **"Rate limits?"** — "Invoices and contacts are pulled once per run into a cache;
  writes update the cache in place. Six payments = two reads. It scales to Xero's
  60/min and 1,000/day budgets."
- **"Why not just Zapier?"** — "Zapier moves data; it creates a new invoice for every
  payment and books gross amounts that never reconcile. Ledger *decides* — match,
  split, or escalate — against the ledger's real state."
- **"What's next?"** — "Overpayments to credit notes, fuzzy contact matching using the
  cached contact graph, and webhook ingest — all inside the seams that already exist."
