ALTER TABLE "credit_entries"
  ALTER COLUMN "hours" TYPE numeric(8, 2)
  USING "hours"::numeric;
