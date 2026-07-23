-- Manual category override flag: set when a user corrects a transaction's
-- category in the Audit view, so future logic never reclassifies it.
ALTER TABLE "LedgerEntry" ADD COLUMN "categoryLocked" BOOLEAN NOT NULL DEFAULT false;
