"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// Live-connection proof: renders the real Demo-org data returned by
// GET /api/xero-health (read-only). This page is the answer to
// "is it really connected?" — demo it as a tab next to the mock demo.

interface Health {
  ok: boolean;
  appMode: string;
  organisation?: string;
  openSalesInvoices?: number;
  sample?: { number: string; contact: string; due: number }[];
  contacts?: number;
  accounts?: number;
  error?: string;
}

const gbp = (n: number) =>
  n.toLocaleString("en-GB", { style: "currency", currency: "GBP" });

export default function ConnectionPage() {
  const [health, setHealth] = useState<Health | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/xero-health")
      .then(async (r) => {
        const body = (await r.json()) as Health;
        if (body.ok) setHealth(body);
        else setFailed(body.error ?? `Request failed (${r.status})`);
      })
      .catch((e) => setFailed(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#6c4df6] to-[#8b5cf6] font-bold text-white shadow-[0_4px_14px_rgba(108,77,246,0.4)]">
            L
          </div>
          <span className="font-sans text-lg font-bold tracking-tight">
            Ledger<span className="text-[#6c4df6]">.</span>
          </span>
        </Link>
        <Link
          href="/demo"
          className="rounded-xl bg-gradient-to-r from-[#6c4df6] to-[#7c3aed] px-5 py-2 font-mono text-[11px] font-bold uppercase tracking-widest text-white shadow-[0_4px_20px_rgba(108,77,246,0.4)] transition-all hover:-translate-y-0.5"
        >
          ▶ Demo
        </Link>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-[#6c4df6]">
          Xero MCP · OAuth 2.0 PKCE
        </p>
        <h1 className="mt-3 font-sans text-3xl font-bold tracking-tight md:text-4xl">
          Is it really connected? Yes — look.
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--muted)]">
          Everything below is fetched live from the Xero API through the MCP server at{" "}
          <code className="font-mono text-[13px]">builders.xero.com</code> — real organisation,
          real counts, read-only. The demo runs on a mock provider behind the same interface;
          this page is the live seam.
        </p>

        <div className="mt-8">
          {health === null && failed === null && (
            <div className="glass-panel flex items-center gap-3 rounded-2xl p-6">
              <span className="live-dot h-3 w-3 rounded-full bg-[#6c4df6]" />
              <span className="font-mono text-sm text-[var(--muted)]">
                Connecting to Xero via MCP…
              </span>
            </div>
          )}

          {failed !== null && (
            <div className="overflow-hidden rounded-2xl border border-[#fde68a] bg-gradient-to-br from-[#fffbeb] to-white shadow-[var(--shadow-sm)]">
              <div className="h-1 bg-gradient-to-r from-[#d97706] to-[#f59e0b]" />
              <div className="p-6">
                <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-[#b45309]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#d97706]" />
                  Live connection unavailable
                </div>
                <p className="mt-3 font-mono text-[12px] leading-relaxed text-[#7a5510]">
                  {failed}
                </p>
                <p className="mt-3 font-mono text-[12px] leading-relaxed text-[var(--muted)]">
                  If the token has expired: run <code>claude mcp list</code> inside the project to
                  refresh it, then reload this page. The mock demo is unaffected either way —{" "}
                  <Link href="/demo" className="font-bold text-[#6c4df6] underline">
                    it runs here
                  </Link>
                  .
                </p>
              </div>
            </div>
          )}

          {health && (
            <>
              <div className="overflow-hidden rounded-2xl border border-[#a7f3d0] bg-gradient-to-br from-[#ecfdf5] to-white shadow-[var(--shadow-sm)]">
                <div className="h-1 bg-gradient-to-r from-[#0fa36b] to-[#34d399]" />
                <div className="flex flex-wrap items-center justify-between gap-4 p-6">
                  <div>
                    <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-widest text-[#0fa36b]">
                      <span className="live-dot h-2.5 w-2.5 rounded-full bg-[#0fa36b]" />
                      Live · connected to Xero
                    </div>
                    <div className="mt-2 font-sans text-2xl font-bold">
                      {health.organisation}
                    </div>
                  </div>
                  <div className="font-mono text-[11px] uppercase tracking-widest text-[var(--muted)]">
                    app mode: {health.appMode} · this page: live
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-3">
                <CountCard label="Open sales invoices" value={health.openSalesInvoices ?? 0} note="GET /Invoices · ACCREC" />
                <CountCard label="Contacts" value={health.contacts ?? 0} note="GET /Contacts" />
                <CountCard label="Chart accounts" value={health.accounts ?? 0} note="GET /Accounts" />
              </div>

              {health.sample && health.sample.length > 0 && (
                <div className="glass-panel mt-4 rounded-2xl p-6">
                  <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">
                    Sample — first open invoices in the org
                  </div>
                  <div className="mt-3 divide-y divide-[var(--ring)]">
                    {health.sample.map((s) => (
                      <div key={s.number} className="flex items-baseline justify-between gap-4 py-2.5">
                        <span className="font-mono text-sm font-bold">{s.number}</span>
                        <span className="flex-1 truncate font-sans text-sm text-[var(--muted)]">
                          {s.contact}
                        </span>
                        <span className="font-mono text-sm">due {gbp(s.due)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function CountCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="glass-panel rounded-2xl p-5">
      <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
        {label}
      </div>
      <div className="mt-2 font-mono text-4xl font-bold text-[#0fa36b]">{value}</div>
      <div className="mt-1 font-mono text-[10px] text-[var(--muted)]">{note}</div>
    </div>
  );
}
