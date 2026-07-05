import Link from "next/link";
import { LedgerMark } from "./ledger-logo";

// Landing — sets up the pitch before the demo. Two clicks max to anything.

const PILLARS = [
  {
    title: "Match, don't create",
    body: "Finds the existing open invoice a payment settles — reference, amount and contact must all agree before it writes.",
    color: "#0fa36b",
  },
  {
    title: "Split the fee",
    body: "£1,200 invoice, £1,165.20 deposit. The £34.80 Stripe fee books to expense, so the bank feed reconciles itself.",
    color: "#d97706",
  },
  {
    title: "Flag the mess",
    body: "Partial payments, unknown senders, duplicate webhooks — routed to a human review queue, never guessed into the ledger.",
    color: "#e8553a",
  },
];

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Top bar */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <LedgerMark />
          <span className="font-sans text-lg font-bold tracking-tight">
            Ledger<span className="text-[var(--accent)]">.</span>
          </span>
        </div>
        <nav className="flex items-center gap-2">
          <Link
            href="/connection"
            className="rounded-xl border border-[var(--ring)] bg-white/80 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            Live connection
          </Link>
          <Link
            href="/demo"
            className="rounded-xl bg-gradient-to-r from-[var(--accent)] to-[#a8681e] px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-white shadow-[0_4px_20px_rgba(201,123,36,0.4)] transition-all hover:-translate-y-0.5"
          >
            ▶ Demo
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-6 py-16">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-[var(--accent)]">
          Stripe → Xero · agent layer
        </p>
        <h1 className="mt-4 max-w-4xl font-sans text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          The reconciliation agent Xero doesn&apos;t have yet.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--muted)]">
          Puzzle rebuilt accounting from scratch to escape manual reconciliation — but 4.4 million
          businesses aren&apos;t leaving Xero. Ledger watches your Stripe account and reconciles it
          into the ledger you already use, including the messy cases Xero still makes you click
          through by hand.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link
            href="/demo"
            className="rounded-xl bg-gradient-to-r from-[var(--accent)] to-[#a8681e] px-8 py-4 font-mono text-sm font-bold uppercase tracking-widest text-white shadow-[0_8px_28px_rgba(201,123,36,0.45)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(201,123,36,0.55)]"
          >
            ▶ Run the demo
          </Link>
          <Link
            href="/connection"
            className="group flex items-center gap-2 rounded-xl border border-[var(--ring)] bg-white/80 px-6 py-4 font-mono text-sm font-bold uppercase tracking-widest text-[var(--foreground)] transition-colors hover:border-[#0fa36b] hover:text-[#0fa36b]"
          >
            <span className="h-2 w-2 rounded-full bg-[#0fa36b]" />
            Proof it&apos;s live
          </Link>
        </div>

        {/* Pillars */}
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="glass-panel rounded-2xl p-6">
              <div className="h-1 w-10 rounded-full" style={{ background: p.color }} />
              <h2 className="mt-4 font-sans text-lg font-bold">{p.title}</h2>
              <p className="mt-2 font-mono text-[12px] leading-relaxed text-[var(--muted)]">
                {p.body}
              </p>
            </div>
          ))}
        </div>
      </main>

      <footer className="mx-auto w-full max-w-6xl px-6 py-6">
        <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--muted)]">
          Encode × Xero hackathon · Track 2 — The Vibe Integrator · built with Claude Code
        </p>
      </footer>
    </div>
  );
}
