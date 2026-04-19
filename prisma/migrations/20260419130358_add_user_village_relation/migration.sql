-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_sys_user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "realName" TEXT NOT NULL,
    "idCard" TEXT,
    "idCardHash" TEXT,
    "phone" TEXT,
    "phoneHash" TEXT,
    "email" TEXT,
    "avatar" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT,
    "villageId" TEXT,
    CONSTRAINT "sys_user_villageId_fkey" FOREIGN KEY ("villageId") REFERENCES "sys_village" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_sys_user" ("avatar", "createdAt", "createdBy", "email", "id", "idCard", "idCardHash", "lastLoginAt", "passwordHash", "phone", "phoneHash", "realName", "salt", "status", "twoFactorEnabled", "updatedAt", "username") SELECT "avatar", "createdAt", "createdBy", "email", "id", "idCard", "idCardHash", "lastLoginAt", "passwordHash", "phone", "phoneHash", "realName", "salt", "status", "twoFactorEnabled", "updatedAt", "username" FROM "sys_user";
DROP TABLE "sys_user";
ALTER TABLE "new_sys_user" RENAME TO "sys_user";
CREATE UNIQUE INDEX "sys_user_username_key" ON "sys_user"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
