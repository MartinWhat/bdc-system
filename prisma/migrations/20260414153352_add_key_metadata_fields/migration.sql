-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_sys_key_version" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyType" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "keyValue" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    "encryptedDataCount" INTEGER DEFAULT 0,
    "migratedToKeyId" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" DATETIME,
    "deletedAt" DATETIME
);
INSERT INTO "new_sys_key_version" ("createdAt", "createdBy", "expiresAt", "id", "isActive", "keyType", "keyValue", "updatedAt", "version") SELECT "createdAt", "createdBy", "expiresAt", "id", "isActive", "keyType", "keyValue", "updatedAt", "version" FROM "sys_key_version";
DROP TABLE "sys_key_version";
ALTER TABLE "new_sys_key_version" RENAME TO "sys_key_version";
CREATE INDEX "sys_key_version_keyType_isActive_isArchived_idx" ON "sys_key_version"("keyType", "isActive", "isArchived");
CREATE INDEX "sys_key_version_keyType_expiresAt_idx" ON "sys_key_version"("keyType", "expiresAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
