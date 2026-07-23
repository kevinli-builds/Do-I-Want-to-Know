-- Track vendors/senders a user has marked "Accepted" (cross-device)
CREATE TABLE "Acceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Acceptance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Acceptance_userId_vendor_key" ON "Acceptance"("userId", "vendor");
