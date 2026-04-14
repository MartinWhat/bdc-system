/*
  Warnings:

  - You are about to drop the column `applicantId` on the `zjd_receive_record` table. All the data in the column will be lost.
  - You are about to drop the column `approveDate` on the `zjd_receive_record` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[refreshToken]` on the table `sys_session` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `createdBy` to the `zjd_receive_record` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "sys_session" ADD COLUMN "deviceFingerprint" TEXT;
ALTER TABLE "sys_session" ADD COLUMN "lastActivityAt" DATETIME;
ALTER TABLE "sys_session" ADD COLUMN "refreshToken" TEXT;
ALTER TABLE "sys_session" ADD COLUMN "refreshTokenExpiresAt" DATETIME;

-- CreateTable
CREATE TABLE "zjd_process_node" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiveRecordId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "operatorId" TEXT,
    "operatorName" TEXT,
    "description" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "zjd_process_node_receiveRecordId_fkey" FOREIGN KEY ("receiveRecordId") REFERENCES "zjd_receive_record" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "zjd_objection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "receiveRecordId" TEXT NOT NULL,
    "objectionType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "resolveRemark" TEXT,
    "resolverId" TEXT,
    "resolverName" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "zjd_objection_receiveRecordId_fkey" FOREIGN KEY ("receiveRecordId") REFERENCES "zjd_receive_record" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "collective_cert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "certNo" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL DEFAULT 'VILLAGE_COLLECTIVE',
    "villageId" TEXT NOT NULL,
    "idCard" TEXT,
    "idCardHash" TEXT,
    "phone" TEXT,
    "phoneHash" TEXT,
    "address" TEXT NOT NULL,
    "area" REAL NOT NULL,
    "landUseType" TEXT,
    "certIssueDate" DATETIME,
    "certExpiryDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING_APPROVE',
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "freezeReason" TEXT,
    "freezeBy" TEXT,
    "freezeAt" DATETIME,
    "stockBy" TEXT,
    "stockAt" DATETIME,
    "stockRemark" TEXT,
    "approveBy" TEXT,
    "approveAt" DATETIME,
    "approveRemark" TEXT,
    "outBy" TEXT,
    "outAt" DATETIME,
    "outReason" TEXT,
    "outApproveBy" TEXT,
    "outApproveAt" DATETIME,
    "outApproveRemark" TEXT,
    "expectedReturnDate" DATETIME,
    "actualReturnDate" DATETIME,
    "returnBy" TEXT,
    "returnAt" DATETIME,
    "returnRemark" TEXT,
    "cancelBy" TEXT,
    "cancelAt" DATETIME,
    "cancelReason" TEXT,
    "attachments" TEXT,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "collective_cert_villageId_fkey" FOREIGN KEY ("villageId") REFERENCES "sys_village" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cert_operation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "certId" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "operatorId" TEXT,
    "operatorName" TEXT,
    "description" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cert_operation_certId_fkey" FOREIGN KEY ("certId") REFERENCES "collective_cert" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_zjd_receive_record" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bdcId" TEXT NOT NULL,
    "receiverName" TEXT,
    "receiverIdCard" TEXT,
    "receiverIdCardHash" TEXT,
    "receiverPhone" TEXT,
    "receiverPhoneHash" TEXT,
    "idCardFrontPhoto" TEXT,
    "idCardBackPhoto" TEXT,
    "scenePhoto" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "applyDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issueDate" DATETIME,
    "receiveDate" DATETIME,
    "signedBy" TEXT,
    "signedDate" DATETIME,
    "remark" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT NOT NULL,
    CONSTRAINT "zjd_receive_record_bdcId_fkey" FOREIGN KEY ("bdcId") REFERENCES "zjd_bdc" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_zjd_receive_record" ("applyDate", "bdcId", "createdAt", "id", "receiveDate", "remark", "status", "updatedAt") SELECT "applyDate", "bdcId", "createdAt", "id", "receiveDate", "remark", "status", "updatedAt" FROM "zjd_receive_record";
DROP TABLE "zjd_receive_record";
ALTER TABLE "new_zjd_receive_record" RENAME TO "zjd_receive_record";
CREATE INDEX "zjd_receive_record_bdcId_idx" ON "zjd_receive_record"("bdcId");
CREATE INDEX "zjd_receive_record_status_idx" ON "zjd_receive_record"("status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "zjd_process_node_receiveRecordId_idx" ON "zjd_process_node"("receiveRecordId");

-- CreateIndex
CREATE INDEX "zjd_objection_receiveRecordId_idx" ON "zjd_objection"("receiveRecordId");

-- CreateIndex
CREATE INDEX "zjd_objection_status_idx" ON "zjd_objection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "collective_cert_certNo_key" ON "collective_cert"("certNo");

-- CreateIndex
CREATE INDEX "collective_cert_villageId_idx" ON "collective_cert"("villageId");

-- CreateIndex
CREATE INDEX "collective_cert_status_idx" ON "collective_cert"("status");

-- CreateIndex
CREATE INDEX "collective_cert_ownerType_idx" ON "collective_cert"("ownerType");

-- CreateIndex
CREATE INDEX "collective_cert_certNo_idx" ON "collective_cert"("certNo");

-- CreateIndex
CREATE INDEX "cert_operation_certId_idx" ON "cert_operation"("certId");

-- CreateIndex
CREATE INDEX "cert_operation_operationType_idx" ON "cert_operation"("operationType");

-- CreateIndex
CREATE UNIQUE INDEX "sys_session_refreshToken_key" ON "sys_session"("refreshToken");

-- CreateIndex
CREATE INDEX "zjd_bdc_villageId_idx" ON "zjd_bdc"("villageId");

-- CreateIndex
CREATE INDEX "zjd_bdc_status_idx" ON "zjd_bdc"("status");
