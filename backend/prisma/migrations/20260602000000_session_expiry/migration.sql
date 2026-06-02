-- Sessions now expire. Backfill any existing rows to 90 days out, then drop the
-- DB-level default (the app sets expiresAt explicitly on every new session).
ALTER TABLE "Session" ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '90 days');
ALTER TABLE "Session" ALTER COLUMN "expiresAt" DROP DEFAULT;
