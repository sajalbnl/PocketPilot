ALTER TABLE "mandates" ADD COLUMN "push_tokens" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "notification" jsonb;
