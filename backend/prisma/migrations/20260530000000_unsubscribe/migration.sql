-- Capture sender + unsubscribe metadata for the unsubscribe helper
ALTER TABLE "LedgerEntry" ADD COLUMN "senderEmail" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "unsubscribe" TEXT;
