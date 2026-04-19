-- CreateTable
CREATE TABLE "notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'SYSTEM',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isPopup" BOOLEAN NOT NULL DEFAULT false,
    "popupStartAt" DATETIME,
    "popupEndAt" DATETIME,
    "validFrom" DATETIME,
    "validUntil" DATETIME,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "authorId" TEXT NOT NULL,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "publishedAt" DATETIME,
    CONSTRAINT "notification_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "sys_user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notification_read" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_read_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notification" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "notification_read_userId_fkey" FOREIGN KEY ("userId") REFERENCES "sys_user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "notification_type_status_idx" ON "notification"("type", "status");

-- CreateIndex
CREATE INDEX "notification_isPopup_popupStartAt_popupEndAt_idx" ON "notification"("isPopup", "popupStartAt", "popupEndAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_read_notificationId_userId_key" ON "notification_read"("notificationId", "userId");
