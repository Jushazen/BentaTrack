-- Leaf 9.5: when an account was deactivated, so a deactivated staff member's queued changes made
-- before it can still be accepted (FR-036). Accounts already deactivated count from their last update.
ALTER TABLE "User" ADD COLUMN "deactivatedAt" TIMESTAMP(3);

UPDATE "User" SET "deactivatedAt" = "updatedAt" WHERE "active" = false;
