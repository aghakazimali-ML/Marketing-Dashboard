-- CreateTable
CREATE TABLE "AiSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "provider" TEXT NOT NULL DEFAULT 'OPENAI',
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "apiKey" TEXT,
    "updatedAt" DATETIME NOT NULL
);