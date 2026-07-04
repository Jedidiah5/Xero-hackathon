import type { XeroProvider } from "./provider";
import type { Account, BankTransaction, Contact, Invoice, Payment } from "./types";

// Demo scenario data — CLAUDE.md section 3. Do not change customers, amounts,
// or invoice numbers without updating the table AND SUBMISSION.md.

const contacts: Contact[] = [
  { ContactID: "con-001", Name: "Northwind Café", EmailAddress: "accounts@northwindcafe.co.uk" },
  { ContactID: "con-002", Name: "Brightside Studio", EmailAddress: "billing@brightside.studio" },
  { ContactID: "con-003", Name: "Harbour Goods", EmailAddress: "finance@harbourgoods.co.uk" },
  { ContactID: "con-004", Name: "Meadow & Co", EmailAddress: "pay@meadowandco.com" },
  { ContactID: "con-005", Name: "Cobalt Press", EmailAddress: "studio@cobaltpress.co.uk" },
  { ContactID: "con-006", Name: "Fern & Fable", EmailAddress: "hello@fernandfable.com" },
];

const contact = (name: string): Contact => {
  const c = contacts.find((c) => c.Name === name);
  if (!c) throw new Error(`Mock contact not found: ${name}`);
  return c;
};

const openInvoice = (
  id: string,
  number: string,
  contactName: string,
  total: number,
  date: string,
  dueDate: string,
  description: string
): Invoice => ({
  InvoiceID: id,
  InvoiceNumber: number,
  Type: "ACCREC",
  Contact: contact(contactName),
  Status: "AUTHORISED",
  LineItems: [
    { Description: description, Quantity: 1, UnitAmount: total, AccountCode: "200", LineAmount: total },
  ],
  SubTotal: total,
  TotalTax: 0,
  Total: total,
  AmountDue: total,
  AmountPaid: 0,
  CurrencyCode: "GBP",
  Date: date,
  DueDate: dueDate,
});

// Open (AUTHORISED) sales invoices in the org. The four demo targets plus two
// decoys so matching isn't trivially 1:1.
const seedInvoices = (): Invoice[] => [
  openInvoice("inv-1042", "INV-1042", "Northwind Café", 420.0, "2026-06-12", "2026-07-12", "Coffee equipment servicing — June"),
  openInvoice("inv-1051", "INV-1051", "Brightside Studio", 1200.0, "2026-06-20", "2026-07-20", "Brand photography retainer — Q3"),
  openInvoice("inv-1039", "INV-1039", "Harbour Goods", 315.5, "2026-06-08", "2026-07-08", "Wholesale order #4471"),
  openInvoice("inv-1047", "INV-1047", "Meadow & Co", 850.0, "2026-06-16", "2026-07-16", "Landscape design — phase 2"),
  openInvoice("inv-1044", "INV-1044", "Cobalt Press", 275.0, "2026-06-14", "2026-07-14", "Print run — summer catalogue"),
  openInvoice("inv-1053", "INV-1053", "Fern & Fable", 640.0, "2026-06-24", "2026-07-24", "Website copy — full site"),
];

const accounts: Account[] = [
  { AccountID: "acc-090", Code: "090", Name: "Business Bank Account", Type: "BANK" },
  { AccountID: "acc-404", Code: "404", Name: "Bank Fees", Type: "EXPENSE" },
];

export class MockXeroProvider implements XeroProvider {
  private invoices: Invoice[] = seedInvoices();
  private payments: Payment[] = [];
  private bankTransactions: BankTransaction[] = [];
  private idSeq = 1;

  async getInvoices(): Promise<Invoice[]> {
    return this.invoices;
  }

  async getContacts(): Promise<Contact[]> {
    return contacts;
  }

  async getAccounts(): Promise<Account[]> {
    return accounts;
  }

  async markPaid(invoiceId: string, amount: number, reference?: string): Promise<Payment> {
    const invoice = this.invoices.find((i) => i.InvoiceID === invoiceId);
    if (!invoice) throw new Error(`Invoice not found: ${invoiceId}`);
    if (invoice.Status === "PAID") throw new Error(`Invoice already paid: ${invoice.InvoiceNumber}`);
    if (amount > invoice.AmountDue) {
      throw new Error(`Payment ${amount} exceeds amount due ${invoice.AmountDue} on ${invoice.InvoiceNumber}`);
    }

    invoice.AmountPaid = round2(invoice.AmountPaid + amount);
    invoice.AmountDue = round2(invoice.Total - invoice.AmountPaid);
    if (invoice.AmountDue === 0) invoice.Status = "PAID";

    const payment: Payment = {
      PaymentID: `pay-${String(this.idSeq++).padStart(3, "0")}`,
      Invoice: { InvoiceID: invoice.InvoiceID, InvoiceNumber: invoice.InvoiceNumber },
      Account: { AccountID: "acc-090", Code: "090" },
      Date: "2026-07-04",
      Amount: amount,
      Reference: reference,
      Status: "AUTHORISED",
    };
    this.payments.push(payment);
    return payment;
  }

  async createFeeExpense(contactName: string, amount: number, reference?: string): Promise<BankTransaction> {
    const txn: BankTransaction = {
      BankTransactionID: `bt-${String(this.idSeq++).padStart(3, "0")}`,
      Type: "SPEND",
      Contact: { ContactID: "con-stripe", Name: "Stripe Payments UK Ltd" },
      LineItems: [
        {
          Description: `Stripe processing fee — ${contactName}`,
          Quantity: 1,
          UnitAmount: amount,
          AccountCode: "404",
          LineAmount: amount,
        },
      ],
      BankAccount: { AccountID: "acc-090", Code: "090", Name: "Business Bank Account" },
      Date: "2026-07-04",
      Status: "AUTHORISED",
      Total: amount,
      Reference: reference,
    };
    this.bankTransactions.push(txn);
    return txn;
  }

  // Mock-only helpers (not on the XeroProvider interface) — used for the
  // dashboard's replay control and for inspecting writes in the UI.
  getPayments(): Payment[] {
    return this.payments;
  }

  getBankTransactions(): BankTransaction[] {
    return this.bankTransactions;
  }

  reset(): void {
    this.invoices = seedInvoices();
    this.payments = [];
    this.bankTransactions = [];
    this.idSeq = 1;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
