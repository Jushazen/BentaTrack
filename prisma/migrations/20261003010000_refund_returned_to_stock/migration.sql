-- H4.2 (FR-039): each refunded item records whether its units went back to stock.

-- AlterTable
ALTER TABLE "RefundItem" ADD COLUMN     "returnedToStock" BOOLEAN NOT NULL DEFAULT true;
