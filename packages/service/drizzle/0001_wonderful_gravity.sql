CREATE TABLE "contract_allowlist_requests" (
	"id" varchar(26) PRIMARY KEY NOT NULL,
	"agent_id" varchar(26) NOT NULL,
	"contract_address" varchar(255) NOT NULL,
	"chain_id" varchar(64) NOT NULL,
	"reason" text NOT NULL,
	"requested_functions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" varchar(255),
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "contract_allowlist_requests" ADD CONSTRAINT "contract_allowlist_requests_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contract_allowlist_requests_agent_id_idx" ON "contract_allowlist_requests" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "contract_allowlist_requests_status_idx" ON "contract_allowlist_requests" USING btree ("status");