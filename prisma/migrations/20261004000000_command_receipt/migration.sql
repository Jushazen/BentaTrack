-- Leaf 9.4: receipts that make offline product, category, and supplier changes idempotent.
CREATE TABLE "CommandReceipt" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandReceipt_pkey" PRIMARY KEY ("id")
);
