import { nanoid } from "nanoid";
import {
  boolean,
  date,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const agents = pgTable(
  "agents",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    name: varchar("name", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledBy: varchar("disabled_by", { length: 255 }),
  },
  (table: any) => [index("agents_status_idx").on(table.status)],
);

export const agentWallets = pgTable(
  "agent_wallets",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    agentId: varchar("agent_id", { length: 26 })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 64 }).notNull(),
    providerWalletId: varchar("provider_wallet_id", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table: any) => [
    uniqueIndex("agent_wallets_agent_id_uq").on(table.agentId),
    index("agent_wallets_provider_idx").on(table.provider),
  ],
);

export const walletAddresses = pgTable(
  "wallet_addresses",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    walletId: varchar("wallet_id", { length: 26 })
      .notNull()
      .references(() => agentWallets.id, { onDelete: "cascade" }),
    chainId: varchar("chain_id", { length: 64 }).notNull(),
    address: varchar("address", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table: any) => [
    uniqueIndex("wallet_addresses_wallet_chain_uq").on(table.walletId, table.chainId),
    index("wallet_addresses_chain_id_idx").on(table.chainId),
    index("wallet_addresses_address_idx").on(table.address),
  ],
);

export const agentTokens = pgTable(
  "agent_tokens",
  {
    jti: varchar("jti", { length: 64 }).primaryKey(),
    agentId: varchar("agent_id", { length: 26 })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: varchar("revoked_by", { length: 255 }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    useCount: integer("use_count").notNull().default(0),
  },
  (table: any) => [
    index("agent_tokens_agent_id_idx").on(table.agentId),
    index("agent_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    agentId: varchar("agent_id", { length: 26 })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    accessJti: varchar("access_jti", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    familyId: varchar("family_id", { length: 26 }).notNull(),
  },
  (table: any) => [
    uniqueIndex("refresh_tokens_token_hash_uq").on(table.tokenHash),
    index("refresh_tokens_agent_id_idx").on(table.agentId),
    index("refresh_tokens_family_id_idx").on(table.familyId),
  ],
);

export const agentPolicies = pgTable(
  "agent_policies",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    agentId: varchar("agent_id", { length: 26 })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    preset: varchar("preset", { length: 16 }).notNull(),
    data: jsonb("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    changeSummary: text("change_summary"),
  },
  (table: any) => [
    uniqueIndex("agent_policies_agent_version_uq").on(table.agentId, table.version),
    index("agent_policies_agent_id_idx").on(table.agentId),
  ],
);

export const spendingTracking = pgTable(
  "spending_tracking",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    agentId: varchar("agent_id", { length: 26 })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    chainId: varchar("chain_id", { length: 64 }).notNull(),
    date: date("date", { mode: "string" }).notNull(),
    totalUsd: decimal("total_usd", { precision: 20, scale: 8 }).notNull().default("0"),
    memecoinUsd: decimal("memecoin_usd", { precision: 20, scale: 8 })
      .notNull()
      .default("0"),
    bridgeUsd: decimal("bridge_usd", { precision: 20, scale: 8 }).notNull().default("0"),
    transactionCount: integer("transaction_count").notNull().default(0),
  },
  (table: any) => [
    uniqueIndex("spending_tracking_agent_chain_date_uq").on(
      table.agentId,
      table.chainId,
      table.date,
    ),
    index("spending_tracking_agent_date_idx").on(table.agentId, table.date),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    agentId: varchar("agent_id", { length: 26 })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    tokenJti: varchar("token_jti", { length: 64 }).references(() => agentTokens.jti, {
      onDelete: "set null",
    }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    action: varchar("action", { length: 128 }).notNull(),
    request: jsonb("request").notNull(),
    policyEvaluation: jsonb("policy_evaluation"),
    approval: jsonb("approval"),
    signing: jsonb("signing"),
    blockchain: jsonb("blockchain"),
    metadata: jsonb("metadata"),
  },
  (table: any) => [
    index("audit_logs_agent_id_idx").on(table.agentId),
    index("audit_logs_token_jti_idx").on(table.tokenJti),
    index("audit_logs_timestamp_idx").on(table.timestamp),
    index("audit_logs_action_idx").on(table.action),
  ],
);

export const pendingApprovals = pgTable(
  "pending_approvals",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    auditLogId: varchar("audit_log_id", { length: 26 })
      .notNull()
      .references(() => auditLogs.id, { onDelete: "cascade" }),
    agentId: varchar("agent_id", { length: 26 })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    approvedBy: varchar("approved_by", { length: 255 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (table: any) => [
    index("pending_approvals_agent_id_idx").on(table.agentId),
    index("pending_approvals_status_idx").on(table.status),
    index("pending_approvals_expires_at_idx").on(table.expiresAt),
  ],
);

export const contractAllowlists = pgTable(
  "contract_allowlists",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    agentId: varchar("agent_id", { length: 26 })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    address: varchar("address", { length: 255 }).notNull(),
    chainId: varchar("chain_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 32 }).notNull(),
    allowedFunctions: jsonb("allowed_functions"),
    maxApprovalAmount: varchar("max_approval_amount", { length: 128 }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    addedBy: varchar("added_by", { length: 255 }).notNull(),
    notes: text("notes"),
  },
  (table: any) => [
    uniqueIndex("contract_allowlists_agent_address_chain_uq").on(
      table.agentId,
      table.address,
      table.chainId,
    ),
    index("contract_allowlists_agent_id_idx").on(table.agentId),
    index("contract_allowlists_chain_id_idx").on(table.chainId),
  ],
);

export const userShares = pgTable(
  "user_shares",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    walletId: varchar("wallet_id", { length: 26 })
      .notNull()
      .references(() => agentWallets.id, { onDelete: "cascade" }),
    encryptedShare: text("encrypted_share").notNull(),
    provider: varchar("provider", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table: any) => [
    uniqueIndex("user_shares_wallet_id_uq").on(table.walletId),
    index("user_shares_provider_idx").on(table.provider),
  ],
);

export const passkeys = pgTable(
  "passkeys",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    credentialId: text("credential_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    deviceType: varchar("device_type", { length: 64 }).notNull(),
    backedUp: boolean("backed_up").notNull().default(false),
    transports: jsonb("transports"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (table: any) => [
    uniqueIndex("passkeys_credential_id_uq").on(table.credentialId),
    index("passkeys_last_used_at_idx").on(table.lastUsedAt),
  ],
);

export const contractAllowlistRequests = pgTable(
  "contract_allowlist_requests",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    agentId: varchar("agent_id", { length: 26 })
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    contractAddress: varchar("contract_address", { length: 255 }).notNull(),
    chainId: varchar("chain_id", { length: 64 }).notNull(),
    reason: text("reason").notNull(),
    requestedFunctions: jsonb("requested_functions").notNull().default([]),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: varchar("reviewed_by", { length: 255 }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table: any) => [
    index("contract_allowlist_requests_agent_id_idx").on(table.agentId),
    index("contract_allowlist_requests_status_idx").on(table.status),
  ],
);

export const knownMemecoins = pgTable(
  "known_memecoins",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    address: varchar("address", { length: 255 }).notNull(),
    chainId: varchar("chain_id", { length: 64 }).notNull(),
    symbol: varchar("symbol", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    source: varchar("source", { length: 128 }).notNull(),
  },
  (table: any) => [
    uniqueIndex("known_memecoins_address_chain_uq").on(table.address, table.chainId),
    index("known_memecoins_symbol_idx").on(table.symbol),
  ],
);

export const knownBridges = pgTable(
  "known_bridges",
  {
    id: varchar("id", { length: 26 }).primaryKey().$defaultFn(() => nanoid()),
    address: varchar("address", { length: 255 }).notNull(),
    chainId: varchar("chain_id", { length: 64 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    canonical: boolean("canonical").notNull().default(false),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table: any) => [
    uniqueIndex("known_bridges_address_chain_uq").on(table.address, table.chainId),
    index("known_bridges_canonical_idx").on(table.canonical),
  ],
);
