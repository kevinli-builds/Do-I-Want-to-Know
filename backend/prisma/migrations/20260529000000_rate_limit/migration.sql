-- Add lastSyncedAt for per-user sync rate limiting
ALTER TABLE "User" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
