import Image from "next/image";

export function LedgerMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <Image
      src="/ledger_icon.png"
      alt="Ledger"
      width={40}
      height={40}
      className={`object-contain ${className}`}
      priority
    />
  );
}
