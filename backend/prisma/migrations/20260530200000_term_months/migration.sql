-- Track multi-month term length so upfront charges can be amortized monthly
ALTER TABLE "LedgerEntry" ADD COLUMN "termMonths" INTEGER;
