-- One account per email, enforced by the database. PROPOSED, not applied.
-- Apply by hand (never prisma db push - see deploy.sh).
--
-- The app already refuses a second account for an email under any provider
-- (auth.service.ts). This index closes the race where two sign-ups for the
-- same address land at the same moment, and covers anything that writes users
-- outside the auth service.
--
-- Safe to apply only while no two live users share an email. Checked on prod
-- 29 Sep 2026: 22 users (20 live), 0 duplicate emails, 0 emails stored with
-- upper case or spaces. The block below re-checks and aborts if that changed;
-- run scripts/report-duplicate-accounts.ts and merge first if it does.
--
-- Soft-deleted users do not collide: deleteAccount rewrites their email to
-- deleted_<md5>_<random>. The admin login switch parks one user on a
-- switch-<random>-<email> address before swapping, so it keeps working too.
--
-- Prisma cannot model an expression index. `prisma migrate diff` will list a
-- DROP INDEX for it; deploy.sh only warns on CREATE TABLE / ADD COLUMN, so that
-- is harmless, but prisma-db-push-unsafe WOULD drop it.
--
-- The existing @@unique([email, providerName]) stays: it is what Prisma knows.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "User"
    GROUP BY lower(email)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate emails exist; merge them before adding this index';
  END IF;
END $$;

CREATE UNIQUE INDEX "User_email_lower_key" ON "User" (lower(email));

COMMIT;

-- Roll back with:
--   DROP INDEX "User_email_lower_key";
