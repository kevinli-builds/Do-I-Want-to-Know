-- Upcoming-events + promotions support: a future event date (delivery ETA,
-- flight/check-in, event, or promo expiry) plus promo code / discount text.
ALTER TABLE "LedgerEntry" ADD COLUMN "eventDate" TIMESTAMP(3);
ALTER TABLE "LedgerEntry" ADD COLUMN "promoCode" TEXT;
ALTER TABLE "LedgerEntry" ADD COLUMN "discount" TEXT;
