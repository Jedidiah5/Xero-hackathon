# Ledger — submission notes (running draft)

> Fill in as we build. Required Xero questions + assets checklist.

## Project description
Ledger is an AI agent that watches a Stripe account and reconciles its activity into Xero
automatically — matching each payment to the right open invoice, splitting out the Stripe
processing fee so the books balance, and flagging what it can't confidently resolve
(partial payments, unknown senders, duplicate webhooks) into a human review queue.

**Dev platform:** Claude Code.
**Status:** Stage 2 (clean matches + fee split reconcile end-to-end). Live Xero connection
pending Xero's fix to the developer account creation error; built against a mock provider
behind the same `XeroProvider` interface, swapped via `XERO_MODE=mock|live`.

## 1. How did the project use the Xero API?
Core workflow: reconciliation. The agent pulls open ACCREC invoices and contacts into a
local cache once per run (rate-limit-aware), matches each incoming Stripe payment against
that cache, and writes back only the results.

**Fee handling — the flagship Xero workflow.** A Stripe payment arrives gross (£1,200) but
deposits net (£1,165.20): the £34.80 processing fee is why naive integrations leave books
that never balance. Ledger books it the way an accountant would, in one atomic decision:
- `POST /Payments` settles the matched invoice for the **gross** £1,200 — the customer paid
  in full; Stripe's cut is the business's cost, not the customer's shortfall.
- `POST /BankTransactions` books the £34.80 fee as a SPEND money transaction against the
  fee-expense account, referenced to the originating Stripe charge id for audit.
- The **net** £1,165.20 is then exactly what lands in the bank feed, so the deposit
  reconciles with zero manual "Find & Match" clicks.
This is the £100-invoice / £97.10-deposit problem Xero users click through by hand today,
resolved by the agent per payment.

## 2. Which Xero API endpoints + methods?
Mirrored 1:1 by the mock provider (`lib/xero/provider.ts` is the swap boundary):

In use as of Stage 2:
- `GET /Invoices` — open ACCREC invoices, pulled ONCE per run into the matching cache
  (rate-limit-aware: 60 calls/min budget, never a per-payment read loop)
- `GET /Contacts` — pulled into the same cache; exact customer matching now, fuzzy later
- `POST /Payments` — apply a matched payment against its invoice for the gross amount
  (marks it PAID)
- `POST /BankTransactions` — book the Stripe processing fee as SPEND money against the
  fee-expense account, referenced to the Stripe charge id

Planned (Stage 3+):
- `GET /Accounts` — bank + fee expense account codes

## 3. Which OAuth 2.0 scopes?
- `accounting.transactions` (invoices, payments, bank transactions — read/write)
- `accounting.contacts`
- `accounting.settings` (chart of accounts)
- plus the openid/profile/email + payments/reports scopes the Xero MCP server grants

## Assets checklist
- [ ] Presentation link (Google Slides/Canva)
- [ ] Demo video
- [ ] 3-minute pitch (skeleton in CLAUDE.md §10)
