// Shared TS types matching Xero's Accounting API shapes.
// Field names mirror Xero's API (PascalCase) so the live provider maps 1:1.
// https://developer.xero.com/documentation/api/accounting/

export type InvoiceStatus = "DRAFT" | "SUBMITTED" | "AUTHORISED" | "PAID" | "VOIDED";

export interface Contact {
  ContactID: string;
  Name: string;
  EmailAddress?: string;
}

export interface LineItem {
  Description: string;
  Quantity: number;
  UnitAmount: number;
  AccountCode?: string;
  LineAmount: number;
}

export interface Invoice {
  InvoiceID: string;
  InvoiceNumber: string; // e.g. "INV-1042"
  Type: "ACCREC"; // sales invoice (accounts receivable)
  Contact: Contact;
  Status: InvoiceStatus;
  LineItems: LineItem[];
  SubTotal: number;
  TotalTax: number;
  Total: number;
  AmountDue: number;
  AmountPaid: number;
  CurrencyCode: string;
  Date: string; // ISO date
  DueDate: string; // ISO date
  Reference?: string;
}

export interface Payment {
  PaymentID: string;
  Invoice: { InvoiceID: string; InvoiceNumber: string };
  Account: { AccountID: string; Code: string };
  Date: string;
  Amount: number;
  Reference?: string;
  Status: "AUTHORISED" | "DELETED";
}

export type BankTransactionType = "SPEND" | "RECEIVE";

export interface BankTransaction {
  BankTransactionID: string;
  Type: BankTransactionType; // fee expense = SPEND
  Contact: Contact;
  LineItems: LineItem[];
  BankAccount: { AccountID: string; Code: string; Name: string };
  Date: string;
  Status: "AUTHORISED";
  Total: number;
  Reference?: string;
}

export interface Account {
  AccountID: string;
  Code: string;
  Name: string;
  Type: "BANK" | "EXPENSE";
}
