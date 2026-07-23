-- Track every examined email (not just stored purchases) so sync dedup covers
-- non-relevant mail too — backfills always advance and Claude isn't re-billed.

-- CreateTable
CREATE TABLE "ProcessedEmail" (
    "userId" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProcessedEmail_pkey" PRIMARY KEY ("userId", "emailId")
);

-- Backfill from existing stored purchases so they aren't re-examined after rollout.
INSERT INTO "ProcessedEmail" ("userId", "emailId", "createdAt")
SELECT "userId", "emailId", "createdAt" FROM "LedgerEntry"
ON CONFLICT DO NOTHING;
