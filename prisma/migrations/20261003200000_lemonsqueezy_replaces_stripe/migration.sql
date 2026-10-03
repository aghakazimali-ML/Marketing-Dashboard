-- DropIndex
DROP INDEX "Workspace_stripeCustomerId_key";

-- DropIndex
DROP INDEX "Workspace_stripeSubscriptionId_key";

-- AlterTable
ALTER TABLE "Workspace" DROP COLUMN "stripeCustomerId",
DROP COLUMN "stripeSubscriptionId",
ADD COLUMN     "lsCustomerId" TEXT,
ADD COLUMN     "lsPortalUrl" TEXT,
ADD COLUMN     "lsSubscriptionId" TEXT,
ADD COLUMN     "lsUpdatedAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "StripeEvent";

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_lsCustomerId_key" ON "Workspace"("lsCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_lsSubscriptionId_key" ON "Workspace"("lsSubscriptionId");

