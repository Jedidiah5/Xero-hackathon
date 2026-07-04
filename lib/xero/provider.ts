import type { Account, BankTransaction, Contact, Invoice, Payment } from "./types";

// The agent and the UI only ever talk to this interface.
// MockXeroProvider and LiveXeroProvider are interchangeable (XERO_MODE=mock|live).
export interface XeroProvider {
  /** Pull open invoices ONCE into a local cache — never live-loop per payment (rate limits). */
  getInvoices(): Promise<Invoice[]>;
  getContacts(): Promise<Contact[]>;
  /** Apply a payment against an invoice (POST /Payments). Full amount → invoice PAID. */
  markPaid(invoiceId: string, amount: number, reference?: string): Promise<Payment>;
  /** Book a Stripe processing fee as a spend-money bank transaction (POST /BankTransactions). */
  createFeeExpense(contactName: string, amount: number, reference?: string): Promise<BankTransaction>;
  getAccounts(): Promise<Account[]>;
}
