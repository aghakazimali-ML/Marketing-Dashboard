/*
  Warnings:

  - You are about to drop the column `periodEnd` on the `PostMetrics` table. All the data in the column will be lost.
  - You are about to drop the column `periodStart` on the `PostMetrics` table. All the data in the column will be lost.
  - You are about to drop the column `syncedAt` on the `PostMetrics` table. All the data in the column will be lost.
  - Made the column `externalId` on table `Post` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `date` to the `PostMetrics` table without a default value. This is not possible if the table is not empty.

*/
-- Data migration: no connector ever wrote Post/PostMetrics rows, so old per-period post
-- metrics are discarded (they cannot be mapped to a single day). Posts keep their rows.
DELETE FROM "PostMetrics";
UPDATE "Post" SET "externalId" = "id" WHERE "externalId" IS NULL;

-- CreateTable
CREATE TABLE "ChannelDailyMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "followers" INTEGER,
    "newFollowers" INTEGER,
    "impressions" INTEGER,
    "reach" INTEGER,
    "engagement" INTEGER,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "clicks" INTEGER,
    "saves" INTEGER,
    "profileVisits" INTEGER,
    "videoViews" INTEGER,
    "watchTimeMin" REAL,
    "avgViewDurSec" REAL,
    "returningViewers" INTEGER,
    "postCount" INTEGER,
    "source" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelDailyMetric_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebsiteDailyMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "propertyChannelId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "users" INTEGER,
    "sessions" INTEGER,
    "newUsers" INTEGER,
    "bounceRate" REAL,
    "avgSessionDurationSec" REAL,
    "conversions" INTEGER,
    "source" TEXT NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebsiteDailyMetric_propertyChannelId_fkey" FOREIGN KEY ("propertyChannelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebsiteBreakdown" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "users" INTEGER,
    "sessions" INTEGER,
    "bounceRate" REAL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebsiteBreakdown_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Channel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT,
    "externalId" TEXT,
    "pageUrl" TEXT,
    "accessToken" TEXT,
    "apiKey" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "connectionStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "refreshToken" TEXT,
    "tokenExpiresAt" DATETIME,
    "lastSuccessAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Channel" ("accessToken", "apiKey", "createdAt", "externalId", "handle", "id", "isActive", "name", "notes", "pageUrl", "platform", "updatedAt") SELECT "accessToken", "apiKey", "createdAt", "externalId", "handle", "id", "isActive", "name", "notes", "pageUrl", "platform", "updatedAt" FROM "Channel";
DROP TABLE "Channel";
ALTER TABLE "new_Channel" RENAME TO "Channel";
CREATE INDEX "Channel_platform_idx" ON "Channel"("platform");
CREATE UNIQUE INDEX "Channel_platform_name_key" ON "Channel"("platform", "name");
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "thumbnailUrl" TEXT,
    "permalink" TEXT,
    "publishedAt" DATETIME NOT NULL,
    "postType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Post_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("channelId", "content", "createdAt", "externalId", "id", "permalink", "platform", "postType", "publishedAt", "thumbnailUrl", "title") SELECT "channelId", "content", "createdAt", "externalId", "id", "permalink", "platform", "postType", "publishedAt", "thumbnailUrl", "title" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE INDEX "Post_platform_publishedAt_idx" ON "Post"("platform", "publishedAt");
CREATE INDEX "Post_channelId_idx" ON "Post"("channelId");
CREATE UNIQUE INDEX "Post_channelId_externalId_key" ON "Post"("channelId", "externalId");
CREATE TABLE "new_PostMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "likes" INTEGER,
    "comments" INTEGER,
    "shares" INTEGER,
    "impressions" INTEGER,
    "reach" INTEGER,
    "clicks" INTEGER,
    "saves" INTEGER,
    "views" INTEGER,
    "engagementRate" REAL,
    "ctr" REAL,
    CONSTRAINT "PostMetrics_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PostMetrics" ("clicks", "comments", "ctr", "engagementRate", "id", "impressions", "likes", "postId", "reach", "saves", "shares", "views") SELECT "clicks", "comments", "ctr", "engagementRate", "id", "impressions", "likes", "postId", "reach", "saves", "shares", "views" FROM "PostMetrics";
DROP TABLE "PostMetrics";
ALTER TABLE "new_PostMetrics" RENAME TO "PostMetrics";
CREATE INDEX "PostMetrics_date_idx" ON "PostMetrics"("date");
CREATE UNIQUE INDEX "PostMetrics_postId_date_key" ON "PostMetrics"("postId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ChannelDailyMetric_date_idx" ON "ChannelDailyMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelDailyMetric_channelId_date_key" ON "ChannelDailyMetric"("channelId", "date");

-- CreateIndex
CREATE INDEX "WebsiteDailyMetric_date_idx" ON "WebsiteDailyMetric"("date");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteDailyMetric_propertyChannelId_date_key" ON "WebsiteDailyMetric"("propertyChannelId", "date");

-- CreateIndex
CREATE INDEX "WebsiteBreakdown_date_kind_idx" ON "WebsiteBreakdown"("date", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteBreakdown_channelId_date_kind_key_key" ON "WebsiteBreakdown"("channelId", "date", "kind", "key");
