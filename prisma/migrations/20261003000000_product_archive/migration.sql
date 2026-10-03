-- H1 (FR-004, FR-057–059): discontinued products are archived, never deleted.
-- REMOVAL history rows (from the old permanent delete) become ARCHIVE.

-- AlterEnum
BEGIN;
CREATE TYPE "InventoryChangeType_new" AS ENUM ('SALE', 'RESTOCK', 'EDIT', 'REFUND', 'ARCHIVE', 'RESTORE');
ALTER TABLE "InventoryChange" ALTER COLUMN "type" TYPE "InventoryChangeType_new"
  USING (CASE WHEN "type"::text = 'REMOVAL' THEN 'ARCHIVE' ELSE "type"::text END)::"InventoryChangeType_new";
ALTER TYPE "InventoryChangeType" RENAME TO "InventoryChangeType_old";
ALTER TYPE "InventoryChangeType_new" RENAME TO "InventoryChangeType";
DROP TYPE "InventoryChangeType_old";
COMMIT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "archivedAt" TIMESTAMP(3);
