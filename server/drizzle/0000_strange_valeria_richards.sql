CREATE TYPE "public"."data_mode" AS ENUM('replay', 'live');--> statement-breakpoint
CREATE TYPE "public"."execution_mode" AS ENUM('paper', 'hyperliquid-testnet');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'SUBMITTED', 'FILLED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."position_status" AS ENUM('OPEN', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."signal_state" AS ENUM('DETECTED', 'ANALYZING', 'PROPOSED', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'FILLED', 'CLOSED', 'NO_TRADE', 'REJECTED', 'RISK_BLOCKED', 'EXPIRED', 'EXECUTION_FAILED');--> statement-breakpoint
CREATE TYPE "public"."trade_side" AS ENUM('LONG', 'SHORT');--> statement-breakpoint
CREATE TABLE "mandates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_name" text NOT NULL,
	"skill_slug" text NOT NULL,
	"allowed_assets" jsonb NOT NULL,
	"allowed_venues" jsonb NOT NULL,
	"max_position_usd" numeric(18, 2) NOT NULL,
	"max_leverage" numeric(8, 2) NOT NULL,
	"max_daily_loss_usd" numeric(18, 2) NOT NULL,
	"stop_loss_required" boolean NOT NULL,
	"approval_required" boolean NOT NULL,
	"signal_expiry_minutes" integer NOT NULL,
	"kill_switch_enabled" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mandates_max_position_positive" CHECK ("mandates"."max_position_usd" > 0),
	CONSTRAINT "mandates_max_leverage_positive" CHECK ("mandates"."max_leverage" > 0),
	CONSTRAINT "mandates_max_daily_loss_positive" CHECK ("mandates"."max_daily_loss_usd" > 0),
	CONSTRAINT "mandates_signal_expiry_positive" CHECK ("mandates"."signal_expiry_minutes" > 0),
	CONSTRAINT "mandates_version_positive" CHECK ("mandates"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"approval_key" text NOT NULL,
	"execution_mode" "execution_mode" NOT NULL,
	"venue_order_id" text,
	"side" "trade_side" NOT NULL,
	"notional_usd" numeric(18, 2) NOT NULL,
	"leverage" numeric(8, 2) NOT NULL,
	"requested_price" numeric(24, 8),
	"fill_price" numeric(24, 8),
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"error" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_notional_positive" CHECK ("orders"."notional_usd" > 0),
	CONSTRAINT "orders_leverage_positive" CHECK ("orders"."leverage" > 0)
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"side" "trade_side" NOT NULL,
	"entry_price" numeric(24, 8) NOT NULL,
	"current_price" numeric(24, 8) NOT NULL,
	"notional_usd" numeric(18, 2) NOT NULL,
	"leverage" numeric(8, 2) NOT NULL,
	"stop_loss_price" numeric(24, 8) NOT NULL,
	"unrealized_pnl" numeric(18, 8) DEFAULT 0 NOT NULL,
	"realized_pnl" numeric(18, 8),
	"status" "position_status" DEFAULT 'OPEN' NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_prices_positive" CHECK ("positions"."entry_price" > 0 AND "positions"."current_price" > 0 AND "positions"."stop_loss_price" > 0),
	CONSTRAINT "positions_notional_positive" CHECK ("positions"."notional_usd" > 0),
	CONSTRAINT "positions_leverage_positive" CHECK ("positions"."leverage" > 0)
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mandate_id" uuid NOT NULL,
	"symbol" text NOT NULL,
	"side" "trade_side",
	"state" "signal_state" DEFAULT 'DETECTED' NOT NULL,
	"data_mode" "data_mode" NOT NULL,
	"market_snapshot" jsonb,
	"triggered_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"llm_output" jsonb,
	"risk_preview" jsonb,
	"proposed_notional_usd" numeric(18, 2),
	"proposed_leverage" numeric(8, 2),
	"stop_loss_price" numeric(24, 8),
	"expires_at" timestamp with time zone,
	"timeline" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "signals_timeline_is_array" CHECK (jsonb_typeof("signals"."timeline") = 'array'),
	CONSTRAINT "signals_triggered_rules_is_array" CHECK (jsonb_typeof("signals"."triggered_rules") = 'array')
);
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_signal_id_signals_id_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."signals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "signals" ADD CONSTRAINT "signals_mandate_id_mandates_id_fk" FOREIGN KEY ("mandate_id") REFERENCES "public"."mandates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "orders_approval_key_uidx" ON "orders" USING btree ("approval_key");--> statement-breakpoint
CREATE INDEX "orders_signal_id_idx" ON "orders" USING btree ("signal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_order_id_uidx" ON "positions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "signals_mandate_id_idx" ON "signals" USING btree ("mandate_id");--> statement-breakpoint
CREATE INDEX "signals_state_idx" ON "signals" USING btree ("state");