-- Support tickets on top of the existing ContactMessage table.
-- Apply by hand (never prisma db push - see deploy.sh), BEFORE deploying the
-- backend that reads these columns:
--   psql "$DATABASE_URL" -f libraries/nestjs-libraries/src/database/prisma/contact-tickets.migration.sql
-- Adds two nullable columns and one new table; touches no existing data.
BEGIN;

ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "ref" TEXT;
ALTER TABLE "ContactMessage" ADD COLUMN IF NOT EXISTS "answeredAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "ContactMessage_ref_key" ON "ContactMessage"("ref");

CREATE TABLE IF NOT EXISTS "ContactReply" (
    "id" TEXT NOT NULL,
    "contactMessageId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "adminUserId" TEXT,
    "adminEmail" TEXT,
    "emailSent" BOOLEAN NOT NULL DEFAULT false,
    "emailError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactReply_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ContactReply_contactMessageId_fkey" FOREIGN KEY ("contactMessageId")
        REFERENCES "ContactMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ContactReply_contactMessageId_createdAt_idx"
    ON "ContactReply"("contactMessageId", "createdAt");

COMMIT;
