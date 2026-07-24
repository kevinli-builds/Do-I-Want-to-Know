-- Per-vendor sensitivity for unusual-charge alerts (§9 A8). Absent row = the
-- default multiplier (3x the vendor's median prior charge).
CREATE TABLE "VendorTolerance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VendorTolerance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorTolerance_userId_vendor_key" ON "VendorTolerance"("userId", "vendor");
