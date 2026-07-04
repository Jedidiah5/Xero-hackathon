# Ledger — submission notes (running draft)

> Fill in as we build. Required Xero questions + assets checklist.

## Project description
Ledger is an AI agent that watches a Stripe account and reconciles its activity into Xero
automatically — matching each payment to the right open invoice, splitting out the Stripe
processing fee so the books balance, and flagging what it can't confidently resolve
(partial payments, unknown senders, duplicate webhooks) into a human review queue.

**Dev platform:** Claude Code.
**Status:** Stage 1 (agent happy path — clean matches reconcile end-to-end). Live Xero
connection pending Xero's fix to the developer account creation error; built against a mock
provider behind the same `XeroProvider` interface, swapped via `XERO_MODE=mock|live`.

## 1. How did the project use the Xero API?
_(fill as stages land)_ Core workflow: reconciliation. The agent pulls open invoices and
contacts into a local cache (rate-limit-aware), matches incoming Stripe payments against
them, writes payments back against matched invoices, and books Stripe fees as spend-money
bank transactions.

## 2. Which Xero API endpoints + methods?
Mirrored 1:1 by the mock provider (`lib/xero/provider.ts` is the swap boundary):

In use as of Stage 1:
- `GET /Invoices` — open ACCREC invoices, pulled ONCE per run into the matching cache
  (rate-limit-aware: 60 calls/min budget, never a per-payment read loop)
- `GET /Contacts` — pulled into the same cache; exact customer matching now, fuzzy later
- `POST /Payments` — apply a matched payment against its invoice (marks it PAID)

Planned (Stages 2–3):
- `POST /BankTransactions` — book the Stripe processing fee (SPEND money)
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
