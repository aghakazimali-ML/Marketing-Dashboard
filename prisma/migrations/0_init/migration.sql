-- CreateTable
CREATE TABLE "Channel" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "newFollowers" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "engagement" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "profileVisits" INTEGER NOT NULL DEFAULT 0,
    "videoViews" INTEGER NOT NULL DEFAULT 0,
    "watchTimeMin" REAL NOT NULL DEFAULT 0,
    "avgViewDurSec" REAL NOT NULL DEFAULT 0,
    "returningViewers" INTEGER NOT NULL DEFAULT 0,
    "ctr" REAL NOT NULL DEFAULT 0,
    "engagementRate" REAL NOT NULL DEFAULT 0,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "extras" TEXT,
    CONSTRAINT "MetricSnapshot_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT,
    "content" TEXT,
    "thumbnailUrl" TEXT,
    "permalink" TEXT,
    "publishedAt" DATETIME NOT NULL,
    "postType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Post_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PostMetrics" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "engagementRate" REAL NOT NULL DEFAULT 0,
    "ctr" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "PostMetrics_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebsiteSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "users" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "bounceRate" REAL NOT NULL DEFAULT 0,
    "avgSessionDurationSec" REAL NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "goalCompletions" INTEGER NOT NULL DEFAULT 0,
    "trafficSources" TEXT,
    "topLandingPages" TEXT
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "platform" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "message" TEXT,
    "error" TEXT,
    "recordsUpserted" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "Channel_platform_idx" ON "Channel"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_platform_name_key" ON "Channel"("platform", "name");

-- CreateIndex
CREATE INDEX "MetricSnapshot_channelId_periodStart_periodEnd_idx" ON "MetricSnapshot"("channelId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "MetricSnapshot_syncedAt_idx" ON "MetricSnapshot"("syncedAt");

-- CreateIndex
CREATE INDEX "Post_platform_publishedAt_idx" ON "Post"("platform", "publishedAt");

-- CreateIndex
CREATE INDEX "Post_channelId_idx" ON "Post"("channelId");

-- CreateIndex
CREATE INDEX "PostMetrics_postId_periodStart_periodEnd_idx" ON "PostMetrics"("postId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "WebsiteSnapshot_periodStart_periodEnd_idx" ON "WebsiteSnapshot"("periodStart", "periodEnd");

