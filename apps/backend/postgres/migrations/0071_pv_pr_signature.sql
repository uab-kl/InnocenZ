-- The PR's finger-drawn signature for a voucher, stored as compact stroke
-- JSON ({w,h,strokes:[[[x,y],...],...]}) written ONLY by the PR sign endpoint.
-- Stroke data, not a bitmap: the PDF re-draws it as crisp vector ink at any
-- size, and a few KB of points beats a base64 PNG in a money row.
ALTER TABLE "main"."payment_voucher" ADD COLUMN IF NOT EXISTS "pr_signature" text;
