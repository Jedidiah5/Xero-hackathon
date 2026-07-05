# Ledger — demo video script (target 1:20, max 1:30)

Speak at a natural pace — the voiceover is ~200 words. Record the screen at
each shot; the on-screen overlays carry the lists so you never read them out.

**Prep before recording:** run `claude mcp list` in the project (fresh token),
`npm run dev`, and do one throwaway run so the app is warm.

---

### 0:00 – 0:12 · HOOK
**Screen:** landing page (`/`), slow scroll to the headline.
**VO:** "This is Ledger — the reconciliation agent Xero doesn't have yet. It
watches Stripe, and books what it sees into Xero the way an accountant would.
We built it entirely with Claude Code."

### 0:12 – 0:48 · THE RUN
**Screen:** `/demo` → click **Run agent**. Let the flow + rows resolve; keep
the cursor still.
**VO:** "Six payments come in. Two match open invoices exactly — marked paid.
One arrives with a Stripe fee, so the agent pays the invoice in full and books
the £34.80 fee to expenses — now the net deposit reconciles. A partial payment
and an unknown sender aren't guessed — they're flagged for human review. And a
duplicate webhook is recognised by charge id and skipped. Nothing double-books."

### 0:48 – 1:02 · IT'S REALLY XERO
**Screen:** click the **Live connection** tab; hover the counts.
**VO:** "And this is live — a real Xero organisation over Xero's MCP server,
authenticated with OAuth PKCE. In live mode those writes are real: invoices in
the Demo Company genuinely flip to paid."

### 1:02 – 1:20 · THE REQUIRED ANSWERS
**Screen:** a single still card (make in Canva) with two columns —

> **Xero API endpoints**
> GET /Invoices · GET /Contacts · GET /Accounts
> **POST /Payments** · **POST /BankTransactions**
>
> **OAuth 2.0 scopes**
> accounting.invoices · accounting.payments
> accounting.banktransactions · accounting.contacts
> accounting.settings (+ .read, openid, offline_access)

**VO:** "Under the hood: invoices, contacts and accounts are read once per run
into a cache, and the agent writes back through POST Payments and POST Bank
Transactions — using the accounting scopes: invoices, payments, bank
transactions, contacts and settings."

### 1:20 – 1:28 · CLOSE
**Screen:** back to the landing wordmark.
**VO:** "Today Stripe, tomorrow any payment source — same engine, same ledger.
Ledger, built with Claude Code for the Encode × Xero hackathon."

---

**Cutting-room notes**
- If you're over time, trim shot 1 to one sentence ("This is Ledger — an agent
  that reconciles Stripe into Xero, built with Claude Code") — never trim the run.
- If live mode isn't warmed up, record `/connection` only (it's read-only and
  always safe) and say "reads and writes go through this connection".
- Mute keyboard/clicks; the flow animation reads best with VO only or very low
  music.
