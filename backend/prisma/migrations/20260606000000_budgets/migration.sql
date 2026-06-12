-- Monthly spending budgets (per category or 'overall', USD).
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Budget_userId_category_key" ON "Budget"("userId", "category");
