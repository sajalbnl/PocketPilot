ALTER TABLE "signals" ADD COLUMN "skill_id" text DEFAULT 'cross-market-catalyst' NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "skill_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "signals" ADD COLUMN "candidate_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "signals_candidate_key_uidx" ON "signals" USING btree ("candidate_key");--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_skill_version_positive" CHECK ("signals"."skill_version" > 0);