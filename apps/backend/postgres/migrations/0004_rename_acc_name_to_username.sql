DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'main'
      AND table_name = 'user'
      AND column_name = 'acc_name'
  ) THEN
    ALTER TABLE "main"."user" RENAME COLUMN "acc_name" TO "user_name";
  END IF;
END $$;
