CREATE TABLE "agent_policies" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"agent_id" varchar(26) NOT NULL,
	"version" integer NOT NULL,
	"preset" varchar(16) NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"change_summary" text
);
--> statement-breakpoint
CREATE TABLE "agent_tokens" (
	"jti" varchar(64) PRIMARY KEY NOT NULL,
	"agent_id" varchar(26) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" varchar(255),
	"last_used_at" timestamp with time zone,
	"use_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_wallets" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"agent_id" varchar(26) NOT NULL,
	"provider" varchar(64) NOT NULL,
	"provider_wallet_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"status" varchar(32) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"disabled_at" timestamp with time zone,
	"disabled_by" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"agent_id" varchar(26) NOT NULL,
	"token_jti" varchar(64),
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"action" varchar(128) NOT NULL,
	"request" jsonb NOT NULL,
	"policy_evaluation" jsonb,
	"approval" jsonb,
	"signing" jsonb,
	"blockchain" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "contract_allowlists" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"agent_id" varchar(26) NOT NULL,
	"address" varchar(255) NOT NULL,
	"chain_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(32) NOT NULL,
	"allowed_functions" jsonb,
	"max_approval_amount" varchar(128),
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" varchar(255) NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "known_bridges" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"chain_id" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"canonical" boolean DEFAULT false NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "known_memecoins" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"address" varchar(255) NOT NULL,
	"chain_id" varchar(64) NOT NULL,
	"symbol" varchar(64) NOT NULL,
	"name" varchar(255) NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" varchar(128) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"device_type" varchar(64) NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"transports" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pending_approvals" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"audit_log_id" varchar(26) NOT NULL,
	"agent_id" varchar(26) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"approved_by" varchar(255),
	"approved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "spending_tracking" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"agent_id" varchar(26) NOT NULL,
	"chain_id" varchar(64) NOT NULL,
	"date" date NOT NULL,
	"total_usd" numeric(20, 8) DEFAULT '0' NOT NULL,
	"memecoin_usd" numeric(20, 8) DEFAULT '0' NOT NULL,
	"bridge_usd" numeric(20, 8) DEFAULT '0' NOT NULL,
	"transaction_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_shares" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"wallet_id" varchar(26) NOT NULL,
	"encrypted_share" text NOT NULL,
	"provider" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_addresses" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"wallet_id" varchar(26) NOT NULL,
	"chain_id" varchar(64) NOT NULL,
	"address" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_policies" ADD CONSTRAINT "agent_policies_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_wallets" ADD CONSTRAINT "agent_wallets_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_token_jti_agent_tokens_jti_fk" FOREIGN KEY ("token_jti") REFERENCES "public"."agent_tokens"("jti") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_allowlists" ADD CONSTRAINT "contract_allowlists_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_approvals" ADD CONSTRAINT "pending_approvals_audit_log_id_audit_logs_id_fk" FOREIGN KEY ("audit_log_id") REFERENCES "public"."audit_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_approvals" ADD CONSTRAINT "pending_approvals_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spending_tracking" ADD CONSTRAINT "spending_tracking_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_shares" ADD CONSTRAINT "user_shares_wallet_id_agent_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."agent_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_addresses" ADD CONSTRAINT "wallet_addresses_wallet_id_agent_wallets_id_fk" FOREIGN KEY ("wallet_id") REFERENCES "public"."agent_wallets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_policies_agent_version_uq" ON "agent_policies" USING btree ("agent_id","version");--> statement-breakpoint
CREATE INDEX "agent_policies_agent_id_idx" ON "agent_policies" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_tokens_agent_id_idx" ON "agent_tokens" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_tokens_expires_at_idx" ON "agent_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_wallets_agent_id_uq" ON "agent_wallets" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "agent_wallets_provider_idx" ON "agent_wallets" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_logs_agent_id_idx" ON "audit_logs" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "audit_logs_token_jti_idx" ON "audit_logs" USING btree ("token_jti");--> statement-breakpoint
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "audit_logs_action_idx" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE UNIQUE INDEX "contract_allowlists_agent_address_chain_uq" ON "contract_allowlists" USING btree ("agent_id","address","chain_id");--> statement-breakpoint
CREATE INDEX "contract_allowlists_agent_id_idx" ON "contract_allowlists" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "contract_allowlists_chain_id_idx" ON "contract_allowlists" USING btree ("chain_id");--> statement-breakpoint
CREATE UNIQUE INDEX "known_bridges_address_chain_uq" ON "known_bridges" USING btree ("address","chain_id");--> statement-breakpoint
CREATE INDEX "known_bridges_canonical_idx" ON "known_bridges" USING btree ("canonical");--> statement-breakpoint
CREATE UNIQUE INDEX "known_memecoins_address_chain_uq" ON "known_memecoins" USING btree ("address","chain_id");--> statement-breakpoint
CREATE INDEX "known_memecoins_symbol_idx" ON "known_memecoins" USING btree ("symbol");--> statement-breakpoint
CREATE UNIQUE INDEX "passkeys_credential_id_uq" ON "passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "passkeys_last_used_at_idx" ON "passkeys" USING btree ("last_used_at");--> statement-breakpoint
CREATE INDEX "pending_approvals_agent_id_idx" ON "pending_approvals" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "pending_approvals_status_idx" ON "pending_approvals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pending_approvals_expires_at_idx" ON "pending_approvals" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "spending_tracking_agent_chain_date_uq" ON "spending_tracking" USING btree ("agent_id","chain_id","date");--> statement-breakpoint
CREATE INDEX "spending_tracking_agent_date_idx" ON "spending_tracking" USING btree ("agent_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "user_shares_wallet_id_uq" ON "user_shares" USING btree ("wallet_id");--> statement-breakpoint
CREATE INDEX "user_shares_provider_idx" ON "user_shares" USING btree ("provider");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_addresses_wallet_chain_uq" ON "wallet_addresses" USING btree ("wallet_id","chain_id");--> statement-breakpoint
CREATE INDEX "wallet_addresses_chain_id_idx" ON "wallet_addresses" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "wallet_addresses_address_idx" ON "wallet_addresses" USING btree ("address");