ALTER TABLE "orders" ADD COLUMN "client_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "quantity" numeric(28, 12);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fee_usd" numeric(18, 8) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "slippage_bps" numeric(10, 4) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "filled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "quantity" numeric(28, 12);--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "entry_fee_usd" numeric(18, 8) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "exit_fee_usd" numeric(18, 8);--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "close_client_order_id" text;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "close_venue_order_id" text;--> statement-breakpoint
ALTER TABLE "positions" ADD COLUMN "close_price" numeric(24, 8);--> statement-breakpoint
UPDATE "orders" SET "client_order_id" = "approval_key" WHERE "client_order_id" IS NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "client_order_id" SET NOT NULL;--> statement-breakpoint
UPDATE "positions" SET "quantity" = "notional_usd" / "entry_price" WHERE "quantity" IS NULL;--> statement-breakpoint
ALTER TABLE "positions" ALTER COLUMN "quantity" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_client_order_id_uidx" ON "orders" USING btree ("client_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_close_client_order_id_uidx" ON "positions" USING btree ("close_client_order_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_quantity_positive" CHECK ("orders"."quantity" IS NULL OR "orders"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fee_nonnegative" CHECK ("orders"."fee_usd" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_slippage_nonnegative" CHECK ("orders"."slippage_bps" >= 0);--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_quantity_positive" CHECK ("positions"."quantity" > 0);--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_entry_fee_nonnegative" CHECK ("positions"."entry_fee_usd" >= 0);--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_exit_fee_nonnegative" CHECK ("positions"."exit_fee_usd" IS NULL OR "positions"."exit_fee_usd" >= 0);--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_close_price_positive" CHECK ("positions"."close_price" IS NULL OR "positions"."close_price" > 0);
