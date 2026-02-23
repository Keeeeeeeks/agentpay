# AgentPay Specification

**Version**: 0.1.0-draft  
**Date**: February 10, 2026  
**Status**: Implementation-Ready  
**Architecture Model**: Google Pay (Cloud Token Service)

---

## Executive Summary

AgentPay is a cloud-based wallet service that lets AI agents transact on-chain without ever touching private keys. Inspired by Google Pay's cloud tokenization model: the private key lives in a cloud signing provider (Para for MVP), and agents authenticate with scoped, time-limited JWTs issued by a KMS-backed token service. Policy enforcement happens server-side at the token validation layer. The service is provider-agnostic, multichain by default (EVM + Solana + Stellar), and exposes a REST API, CLI, MCP server, and policy dashboard.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          AGENTPAY ARCHITECTURE                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  HUMAN LAYER (Passkey Auth)          AGENT LAYER (JWT Auth)              │
│  ─────────────────────────           ─────────────────────               │
│  • Create/revoke agents              • Sign transactions                 │
│  • Set/modify policies (dashboard)   • Check balances                    │
│  • Approve high-value tx             • Query policy limits               │
│  • View audit logs                   • Request allowlist additions       │
│  • Fund wallets                      • Connect to dApps (WC, post-MVP)   │
│                                                                          │
│           │                                    │                         │
│           │ Passkey (WebAuthn)                  │ JWT (scoped, 24h exp)  │
│           ▼                                    ▼                         │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │                      AGENTPAY SERVICE                              │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │                    AUTH LAYER                               │   │  │
│  │  │                                                             │   │  │
│  │  │  Passkey Verifier ◀── human requests (policy changes,       │   │  │
│  │  │                       agent CRUD, approvals)                │   │  │
│  │  │  JWT Validator    ◀── agent requests (sign, balance, etc)   │   │  │
│  │  │  Token Issuer     ──▶ KMS-signed JWTs (key never in mem)    │   │  │
│  │  │  Token Revoker    ──▶ instant revocation via DB blocklist   │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │                   POLICY ENGINE                             │   │  │
│  │  │                                                             │   │  │
│  │  │  Presets: safe | normal | degen | custom                    │   │  │
│  │  │                                                             │   │  │
│  │  │  Evaluation chain (in order):                               │   │  │
│  │  │   1. Token valid + not revoked                              │   │  │
│  │  │   2. Token scope covers requested chain                     │   │  │
│  │  │   3. Target address not in blocklist                        │   │  │
│  │  │   4. Contract in allowlist (if mode=allowlist)              │   │  │
│  │  │   5. Function selector allowed                              │   │  │
│  │  │   6. Asset class check (memecoin/bridge rules)              │   │  │
│  │  │   7. Value ≤ per-tx limit                                   │   │  │
│  │  │   8. Value + daily_spent ≤ daily limit                      │   │  │
│  │  │   9. Rate limit check                                       │   │  │
│  │  │  10. Token approval cap check                               │   │  │
│  │  │  11. Autonomous threshold → auto-sign or queue for human    │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │           SIGNING PROVIDER (Adapter Interface)              │   │  │
│  │  │                                                             │   │  │
│  │  │  interface SigningProvider {                                │   │  │
│  │  │    name: string                                             │   │  │
│  │  │    createWallet(type, id): WalletInfo                       │   │  │
│  │  │    getAddress(chainId): string                              │   │  │
│  │  │    signTransaction(tx): SignedTransaction                   │   │  │
│  │  │    signMessage(msg, chainId): string                        │   │  │
│  │  │    healthCheck(): boolean                                   │   │  │
│  │  │  }                                                          │   │  │
│  │  │                                                             │   │  │
│  │  │  MVP:  ParaProvider  (pregen wallets, MPC, EVM+Solana)      │   │  │
│  │  │  v2:   TurnkeyProvider (enclave, native policy)             │   │  │
│  │  │  v2:   PrivyProvider (Stellar support)                      │   │  │
│  │  │  v3:   HSMProvider (hardware, Apple Pay model)              │   │  │
│  │  │  dev:  LocalProvider (in-memory, testing only)              │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │             CHAIN ABSTRACTION LAYER                         │   │  │
│  │  │                                                             │   │  │
│  │  │  EvmChain  (viem)   → Eth, Base, Arb, OP, Polygon, etc      │   │  │
│  │  │  SolanaChain (web3) → Mainnet, Devnet                       │   │  │
│  │  │  StellarChain (Privy + Stellar SDK) → Mainnet, Testnet      │   │  │
│  │  │                                                             │   │  │
│  │  │  Common interface:                                          │   │  │
│  │  │    getBalance(address): NativeBalance                       │   │  │
│  │  │    getTokenBalances(address): TokenBalance[]                │   │  │
│  │  │    broadcastTransaction(signedTx): TxHash                   │   │  │
│  │  │    getTransactionReceipt(hash): Receipt                     │   │  │
│  │  │    estimateGas(tx): GasEstimate                             │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                    │  │
│  │  ┌─────────────────────────────────────────────────────────────┐   │  │
│  │  │              AUDIT & OBSERVABILITY                          │   │  │
│  │  │                                                             │   │  │
│  │  │  • Every request logged (who, what, when, result)           │   │  │
│  │  │  • Per-agent, per-token usage tracking                      │   │  │
│  │  │  • Spending aggregation (daily/weekly per agent per chain)  │   │  │
│  │  │  • Policy change audit trail (who changed what, when)       │   │  │
│  │  │  • Anomaly flags (unusual patterns trigger alerts)          │   │  │
│  │  └─────────────────────────────────────────────────────────────┘   │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  INTERFACES:                                                             │
│  ─────────                                                               │
│  REST API     → /v1/* (agents + humans)                                  │
│  CLI          → npx agentpay <command> (humans)                          │
│  Dashboard    → Web UI for policy management (humans)                    │
│  MCP Server   → Tool calls for AI agents                                 │
│  WC Relay     → WalletConnect v2 (post-MVP, P0.5)                        │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture model | Google Pay (cloud token) | Most viable for MVP, no hardware procurement |
| Agent auth | Scoped JWT, 24h expiry, KMS-signed | Time-limited, revocable, key never in memory |
| JWT signing | AWS KMS asymmetric key (RS256) | Non-extractable signing key, ~50ms overhead acceptable |
| Token delegation | Schema-ready, not implemented | `parent_token_id` field in JWT, logic deferred |
| Policy management | Web dashboard (Fireblocks-inspired) | Visual rule builder, not config files |
| Policy escalation auth | Passkey required for limit increases | Compromised server can't escalate permissions |
| Signing provider | Para (MVP), adapter interface for others | Already partially implemented, MPC model proven |
| Chains | EVM + Solana (Para) + Stellar (Privy) | User requirement |
| Agent-wallet mapping | 1 agent = 1 wallet | Clean isolation, simple audit trail |
| WalletConnect | Post-MVP (P0.5), interface stubbed | Critical but not blocking MVP |
| CLI | npm package (`npx agentpay`) | Easy distribution, Node.js dependency acceptable |
| MCP server | Thin wrapper over REST API | Agent-native integration |

---

## Agent Token (JWT) Schema

```typescript
interface AgentToken {
  // Standard JWT claims
  sub: string;              // agent ID ("agent_abc123")
  iss: "agentpay";          // issuer
  iat: number;              // issued at (unix seconds)
  exp: number;              // expiry (default: iat + 86400 = 24h)
  jti: string;              // unique token ID (for revocation)

  // AgentPay claims (namespaced under "ap")
  ap: {
    wallet_id: string;      // which wallet this token controls
    chains: string[];       // allowed chain IDs (["1","8453","solana-mainnet","stellar-mainnet"] or ["*"])
    policy_id: string;      // references the agent's policy in DB
    preset: PolicyPreset;   // "safe" | "normal" | "degen" | "custom"

    // For future token delegation
    parent_token_id?: string;
    delegation_depth?: number;  // max 3 levels
  };
}
```

### Token Lifecycle

```
Human authenticates (passkey)
  → POST /v1/agents (creates agent + wallet + policy)
  → POST /v1/agents/:id/tokens (KMS signs JWT)
  → JWT returned to human
  → Human gives JWT to agent (env var, secret manager, etc.)

Agent uses JWT for 24h
  → On expiry: agent must request refresh (TODO: auto-refresh flow)
  → On revocation: JWT immediately invalid (checked against DB blocklist)

Human can revoke at any time:
  → DELETE /v1/agents/:id/tokens/:jti (adds to blocklist)
  → DELETE /v1/agents/:id (revokes ALL tokens, disables wallet)
```

---

## Policy Engine

### Policy Presets

| Parameter | Safe | Normal | Degen |
|-----------|------|--------|-------|
| **Spending Limits** | | | |
| Max per-tx | $25 | $250 | $10,000 |
| Daily limit | $100 | $2,500 | $50,000 |
| Weekly limit | $500 | $10,000 | $250,000 |
| **Rate Limits** | | | |
| Tx/hour | 5 | 20 | 100 |
| Tx/day | 20 | 100 | 500 |
| **Approval** | | | |
| Autonomous threshold | $25 | $250 | $10,000 |
| Human required above | $25 | $250 | $10,000 |
| **Contract Interaction** | | | |
| Contract mode | allowlist | verified | blocklist-only |
| Token approvals | Exact amount only | Capped (2x trade) | Uncapped |
| **Bridging** | | | |
| Bridge mode | `no` | `stables_canonical` | `yes` |
| Allowed bridges (when enabled) | — | Major only (Across, Stargate, CCTP) | Any non-blocklisted |
| Bridgeable assets (stables_canonical) | — | USDC, USDT, DAI + canonical wrapped | All |
| **Memecoins** | | | |
| Memecoin trading | `no` | `capped` | `yes` |
| Memecoin per-tx limit (when capped) | — | $50 | Inherits per-tx limit |
| Memecoin daily limit (when capped) | — | $200 | Inherits daily limit |
| Memecoin detection | — | Token age < 30d OR market cap < $10M OR in memecoin list | Same |

### Policy Schema

```typescript
type PolicyPreset = "safe" | "normal" | "degen" | "custom";

type BridgeMode = "no" | "stables_canonical" | "yes";
type MemecoinMode = "no" | "capped" | "yes";
type ContractMode = "allowlist" | "verified" | "blocklist_only";

interface AgentPolicy {
  id: string;
  agentId: string;
  preset: PolicyPreset;
  version: number;                    // Incremented on every change
  updatedAt: number;
  updatedBy: string;                  // Passkey credential ID

  spending: {
    maxTransactionValueUsd: number;
    dailyLimitUsd: number;
    weeklyLimitUsd: number;
  };

  rateLimits: {
    maxTxPerHour: number;
    maxTxPerDay: number;
  };

  approval: {
    autonomousThresholdUsd: number;   // Auto-sign below this
  };

  contracts: {
    mode: ContractMode;
    allowlist: ContractAllowlistEntry[];  // Used when mode=allowlist
    blocklist: string[];                   // Always checked
    tokenApprovalMode: "exact" | "capped" | "uncapped";
    tokenApprovalCapMultiplier?: number;   // e.g., 2 = 2x trade amount
  };

  bridging: {
    mode: BridgeMode;
    allowedBridges: string[];             // Contract addresses
    allowedAssets: string[];              // Token addresses/symbols (for stables_canonical)
  };

  memecoins: {
    mode: MemecoinMode;
    perTxLimitUsd?: number;               // Used when mode=capped
    dailyLimitUsd?: number;               // Used when mode=capped
    detectionCriteria: {
      maxTokenAgeDays: number;            // Default: 30
      maxMarketCapUsd: number;            // Default: 10_000_000
      knownMemecoinList: string[];        // Curated list of addresses
    };
  };

  chains: {
    allowed: string[];                    // ["1","8453","42161","solana-mainnet","stellar-mainnet"] or ["*"]
    perChainOverrides?: Record<string, {
      maxTransactionValueUsd?: number;
      autonomousThresholdUsd?: number;
    }>;
  };
}
```

### Policy Evaluation Flow

```typescript
async function evaluateTransaction(
  token: AgentToken,
  tx: TransactionRequest,
  policy: AgentPolicy
): Promise<PolicyResult> {
  const checks = [
    checkTokenNotRevoked(token.jti),
    checkChainAllowed(tx.chainId, token.ap.chains, policy.chains),
    checkBlocklist(tx.to, policy.contracts.blocklist),
    checkContractAllowed(tx.to, tx.chainId, policy.contracts),
    checkFunctionAllowed(tx.data, tx.to, tx.chainId, policy.contracts),
    checkAssetClass(tx, policy),            // Bridge + memecoin rules
    checkTransactionValue(tx, policy),
    checkDailyLimit(tx, token.sub, policy),
    checkWeeklyLimit(tx, token.sub, policy),
    checkRateLimits(token.sub, policy),
    checkTokenApprovalCap(tx, policy),
  ];

  for (const check of checks) {
    const result = await check;
    if (!result.passed) return { allowed: false, ...result };
  }

  const valueUsd = await convertToUsd(tx.value, tx.chainId);
  const requiresHuman = valueUsd > policy.approval.autonomousThresholdUsd;

  return { allowed: true, requiresHumanApproval: requiresHuman };
}
```

### Asset Class Detection

```typescript
async function checkAssetClass(
  tx: TransactionRequest,
  policy: AgentPolicy
): Promise<CheckResult> {
  // 1. Bridge detection
  if (isBridgeTransaction(tx)) {
    if (policy.bridging.mode === "no") {
      return { passed: false, reason: "Bridging is disabled" };
    }
    if (policy.bridging.mode === "stables_canonical") {
      if (!isStableOrCanonical(tx, policy.bridging.allowedAssets)) {
        return { passed: false, reason: "Only stablecoins and canonical tokens can be bridged" };
      }
    }
    // mode === "yes" → allow
  }

  // 2. Memecoin detection
  if (await isMemecoinTransaction(tx, policy.memecoins.detectionCriteria)) {
    if (policy.memecoins.mode === "no") {
      return { passed: false, reason: "Memecoin trading is disabled" };
    }
    if (policy.memecoins.mode === "capped") {
      const valueUsd = await convertToUsd(tx.value, tx.chainId);
      if (valueUsd > (policy.memecoins.perTxLimitUsd ?? 0)) {
        return { passed: false, reason: `Memecoin tx exceeds cap ($${policy.memecoins.perTxLimitUsd})` };
      }
      const dailyMemecoinSpend = await getMemecoinDailySpend(tx.agentId);
      if (dailyMemecoinSpend + valueUsd > (policy.memecoins.dailyLimitUsd ?? 0)) {
        return { passed: false, reason: `Memecoin daily limit exceeded` };
      }
    }
    // mode === "yes" → allow (subject to normal limits)
  }

  return { passed: true };
}
```

---

## Signing Provider Adapter

```typescript
interface SigningProvider {
  readonly name: string;

  initialize(config: ProviderConfig): Promise<void>;

  // Wallet management
  createWallet(type: WalletType, identifier: string): Promise<WalletInfo>;
  getAddress(chainId: string): Promise<string>;
  listWallets(): Promise<WalletInfo[]>;

  // Signing
  signTransaction(tx: SignableTransaction): Promise<SignedTransaction>;
  signMessage(message: string, chainId: string): Promise<string>;

  // Health
  healthCheck(): Promise<boolean>;
}

// Provider implementations share no base class — just the interface.
// Each handles its own authentication, key management, and error handling.

// MVP: ParaProvider
//   - createWallet → createPregenWallet()
//   - signTransaction → loadUserShare() + viem client sign
//   - Chains: EVM, Solana

// v2: TurnkeyProvider
//   - createWallet → createWallet API
//   - signTransaction → Turnkey API signTransaction
//   - Chains: EVM, Solana

// v2: PrivyProvider
//   - createWallet → Privy server wallet API
//   - signTransaction → Privy server sign
//   - Chains: Stellar (primary), EVM (fallback)

// dev: LocalProvider
//   - In-memory keys for testing
//   - NEVER for production
```

---

## Chain Abstraction Layer

```typescript
interface ChainAdapter {
  readonly chainType: "evm" | "solana" | "stellar";
  readonly chainId: string;
  readonly displayName: string;
  readonly nativeToken: { symbol: string; decimals: number };

  // Read operations
  getBalance(address: string): Promise<TokenBalance>;
  getTokenBalances(address: string): Promise<TokenBalance[]>;
  getTransaction(hash: string): Promise<TransactionInfo | null>;

  // Write operations
  broadcastTransaction(signedTx: string): Promise<string>;  // returns hash
  waitForConfirmation(hash: string, timeoutMs?: number): Promise<TransactionReceipt>;

  // Estimation
  estimateGas(tx: UnsignedTransaction): Promise<GasEstimate>;
  getNonce(address: string): Promise<number>;
}

// Registry
const chains: Record<string, ChainAdapter> = {
  "1":               new EvmChainAdapter({ chainId: 1, name: "Ethereum", rpc: "..." }),
  "8453":            new EvmChainAdapter({ chainId: 8453, name: "Base", rpc: "..." }),
  "42161":           new EvmChainAdapter({ chainId: 42161, name: "Arbitrum", rpc: "..." }),
  "10":              new EvmChainAdapter({ chainId: 10, name: "Optimism", rpc: "..." }),
  "137":             new EvmChainAdapter({ chainId: 137, name: "Polygon", rpc: "..." }),
  "solana-mainnet":  new SolanaChainAdapter({ network: "mainnet-beta" }),
  "solana-devnet":   new SolanaChainAdapter({ network: "devnet" }),
  "stellar-mainnet": new StellarChainAdapter({ network: "mainnet" }),
  "stellar-testnet": new StellarChainAdapter({ network: "testnet" }),
};
```

---

## API Surface

### Human Endpoints (Passkey auth required)

```
POST   /v1/auth/passkey/register        Register a new passkey
POST   /v1/auth/passkey/authenticate    Authenticate with passkey

POST   /v1/agents                        Create agent (+ wallet + policy + first token)
GET    /v1/agents                        List agents
GET    /v1/agents/:id                    Get agent details
DELETE /v1/agents/:id                    Revoke agent (revokes all tokens, disables wallet)

POST   /v1/agents/:id/tokens            Issue new JWT for agent
GET    /v1/agents/:id/tokens            List active tokens
DELETE /v1/agents/:id/tokens/:jti       Revoke specific token

GET    /v1/agents/:id/policy            Get agent policy
PUT    /v1/agents/:id/policy            Update agent policy (passkey re-auth for escalation)
GET    /v1/policies/presets             List available presets
GET    /v1/policies/presets/:name       Get preset details

POST   /v1/approve/:id                  Approve pending transaction (passkey)
POST   /v1/reject/:id                   Reject pending transaction
GET    /v1/approvals/pending            List pending approvals

GET    /v1/audit                        View audit logs (filterable)
GET    /v1/audit/:agentId               View agent-specific audit logs
```

### Agent Endpoints (JWT auth required)

```
GET    /v1/wallets/me                   Get wallet info (addresses per chain)
GET    /v1/wallets/me/balances          Get all balances (native + tokens, all chains)
GET    /v1/wallets/me/balances/:chain   Get balance for specific chain

POST   /v1/transactions/sign            Submit transaction for signing
GET    /v1/transactions/:id             Check transaction status

GET    /v1/policy/me                    Get current policy limits
GET    /v1/policy/me/remaining          Get remaining daily/weekly budget
GET    /v1/policy/me/can-transact       Pre-check if a transaction would pass policy

POST   /v1/allowlist/request            Request contract allowlist addition
```

### Open Endpoints

```
GET    /v1/health                       Service health + provider status
GET    /v1/chains                       List supported chains
```

---

## CLI Surface

```bash
# Setup
agentpay init                                     # Interactive: choose provider, configure API keys
agentpay login                                    # Authenticate with passkey

# Agent management
agentpay agent create --name "trader" --preset safe --chains eth,base,sol
agentpay agent list
agentpay agent info <agent-id>
agentpay agent revoke <agent-id>

# Token management
agentpay token create <agent-id>                  # Print JWT to stdout
agentpay token create <agent-id> --export .env    # Write AGENTPAY_TOKEN=... to .env
agentpay token list <agent-id>
agentpay token revoke <agent-id> <jti>

# Policy management
agentpay policy show <agent-id>
agentpay policy set <agent-id> --preset degen
agentpay policy set <agent-id> --daily-limit 500 --max-tx 50
agentpay policy set <agent-id> --bridge-mode stables_canonical
agentpay policy set <agent-id> --memecoin-mode capped --memecoin-tx-limit 100
agentpay policy presets                           # List presets with details

# Balance & read operations
agentpay balance <agent-id>                       # All chains
agentpay balance <agent-id> --chain eth           # Specific chain
agentpay balance <agent-id> --tokens              # Include ERC20/SPL tokens

# Audit
agentpay audit --last 24h
agentpay audit --agent <agent-id>
agentpay audit --agent <agent-id> --format json

# Approvals
agentpay approvals list                           # Pending approvals
agentpay approvals approve <id>                   # Approve (prompts passkey)
agentpay approvals reject <id>
```

---

## Database Schema

```sql
-- Agents
CREATE TABLE agents (
  id VARCHAR(26) PRIMARY KEY,                -- nanoid
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',       -- active, disabled, revoked
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255) NOT NULL,          -- passkey credential ID
  disabled_at TIMESTAMP,
  disabled_by VARCHAR(255)
);

-- Agent wallets (1 agent = 1 wallet, but wallet has addresses per chain)
CREATE TABLE agent_wallets (
  id VARCHAR(26) PRIMARY KEY,
  agent_id VARCHAR(26) REFERENCES agents(id) NOT NULL,
  provider VARCHAR(50) NOT NULL,              -- "para", "turnkey", "privy"
  provider_wallet_id VARCHAR(255) NOT NULL,   -- provider's internal wallet ID
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id)
);

-- Wallet addresses per chain
CREATE TABLE wallet_addresses (
  id VARCHAR(26) PRIMARY KEY,
  wallet_id VARCHAR(26) REFERENCES agent_wallets(id) NOT NULL,
  chain_id VARCHAR(50) NOT NULL,
  address VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(wallet_id, chain_id)
);

-- Agent tokens (JWTs)
CREATE TABLE agent_tokens (
  jti VARCHAR(26) PRIMARY KEY,               -- JWT ID
  agent_id VARCHAR(26) REFERENCES agents(id) NOT NULL,
  issued_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP,
  revoked_by VARCHAR(255),
  last_used_at TIMESTAMP,
  use_count INTEGER DEFAULT 0
);

-- Agent policies (versioned)
CREATE TABLE agent_policies (
  id VARCHAR(26) PRIMARY KEY,
  agent_id VARCHAR(26) REFERENCES agents(id) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  preset VARCHAR(20) NOT NULL,
  data JSONB NOT NULL,                        -- Full AgentPolicy JSON
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255) NOT NULL,
  change_summary TEXT,                        -- Human description of what changed
  UNIQUE(agent_id, version)
);

-- Spending tracking (per agent per chain per day)
CREATE TABLE spending_tracking (
  id VARCHAR(26) PRIMARY KEY,
  agent_id VARCHAR(26) REFERENCES agents(id) NOT NULL,
  chain_id VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  total_usd DECIMAL(20, 2) DEFAULT 0,
  memecoin_usd DECIMAL(20, 2) DEFAULT 0,     -- Subset: memecoin spending
  bridge_usd DECIMAL(20, 2) DEFAULT 0,       -- Subset: bridge spending
  transaction_count INTEGER DEFAULT 0,
  UNIQUE(agent_id, chain_id, date)
);

-- Audit logs
CREATE TABLE audit_logs (
  id VARCHAR(26) PRIMARY KEY,
  agent_id VARCHAR(26) REFERENCES agents(id),
  token_jti VARCHAR(26),
  timestamp TIMESTAMP DEFAULT NOW(),
  action VARCHAR(50) NOT NULL,                -- "sign_request", "policy_change", "token_issued", etc.
  request JSONB,
  policy_evaluation JSONB,
  approval JSONB,
  signing JSONB,
  blockchain JSONB,
  metadata JSONB                              -- Catch-all for action-specific data
);

-- Pending approvals
CREATE TABLE pending_approvals (
  id VARCHAR(26) PRIMARY KEY,
  audit_log_id VARCHAR(26) REFERENCES audit_logs(id),
  agent_id VARCHAR(26) REFERENCES agents(id) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',       -- pending, approved, rejected, expired
  approved_by VARCHAR(255),
  approved_at TIMESTAMP
);

-- Contract allowlists (per agent)
CREATE TABLE contract_allowlists (
  id VARCHAR(26) PRIMARY KEY,
  agent_id VARCHAR(26) REFERENCES agents(id) NOT NULL,
  address VARCHAR(255) NOT NULL,
  chain_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,                  -- dex, lending, nft, bridge, token, other
  allowed_functions JSONB,
  max_approval_amount VARCHAR(255),
  added_at TIMESTAMP DEFAULT NOW(),
  added_by VARCHAR(255) NOT NULL,
  notes TEXT,
  UNIQUE(agent_id, address, chain_id)
);

-- User share storage (encrypted, for Para provider)
CREATE TABLE user_shares (
  id VARCHAR(26) PRIMARY KEY,
  wallet_id VARCHAR(26) REFERENCES agent_wallets(id) NOT NULL,
  encrypted_share TEXT NOT NULL,              -- AES-256-GCM encrypted
  provider VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(wallet_id)
);

-- Passkeys (admin authentication)
CREATE TABLE passkeys (
  id VARCHAR(26) PRIMARY KEY,
  credential_id VARCHAR(512) NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER DEFAULT 0,
  device_type VARCHAR(50),
  backed_up VARCHAR(10),
  transports JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  last_used_at TIMESTAMP
);

-- Known memecoin list (curated)
CREATE TABLE known_memecoins (
  id VARCHAR(26) PRIMARY KEY,
  address VARCHAR(255) NOT NULL,
  chain_id VARCHAR(50) NOT NULL,
  symbol VARCHAR(20),
  name VARCHAR(255),
  added_at TIMESTAMP DEFAULT NOW(),
  source VARCHAR(255),                        -- Where we learned this is a memecoin
  UNIQUE(address, chain_id)
);

-- Known bridges (for bridge detection)
CREATE TABLE known_bridges (
  id VARCHAR(26) PRIMARY KEY,
  address VARCHAR(255) NOT NULL,
  chain_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  canonical BOOLEAN DEFAULT false,            -- Is this a "major" canonical bridge?
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(address, chain_id)
);
```

---

## Security Model

### Token Security

| Threat | Mitigation |
|--------|------------|
| JWT signing key extraction | KMS — key never leaves hardware security module |
| Stolen agent JWT | 24h expiry + instant revocation via DB blocklist |
| JWT replay | `jti` uniqueness + per-request nonce tracking |
| Token scope escalation | Policy embedded in JWT claims, validated server-side against DB |
| Server compromise → policy escalation | Passkey re-auth required for any limit increase |

### Signing Security

| Threat | Mitigation |
|--------|------------|
| Private key extraction | Para MPC — neither party has full key |
| Compromised agent drains wallet | Per-agent policy with daily/weekly caps |
| Rapid small transactions | Per-hour and per-day rate limits |
| Malicious contract interaction | Allowlist/blocklist modes per agent |
| Unlimited token approvals | Approval cap modes (exact, capped, uncapped) |
| Bridge exploitation | Bridge mode with asset restrictions |
| Memecoin rug pulls | Memecoin detection + separate spend caps |

### Policy Change Security

| Action | Auth Required |
|--------|---------------|
| Create agent | Passkey |
| Revoke agent | Passkey |
| Issue token | Passkey |
| Revoke token | Passkey |
| Tighten policy (lower limits) | Passkey |
| Loosen policy (raise limits) | Passkey + re-authentication |
| Change preset (safe→degen) | Passkey + re-authentication |
| View audit logs | Passkey |

---

## Project Structure

```
ai-wallet/
├── packages/
│   ├── service/                  # Core AgentPay service
│   │   ├── src/
│   │   │   ├── auth/             # JWT (KMS) + Passkey auth
│   │   │   │   ├── jwt.ts        # Token issuer, validator, revoker
│   │   │   │   ├── kms.ts        # AWS KMS integration
│   │   │   │   ├── passkey.ts    # WebAuthn verification
│   │   │   │   └── middleware.ts # Hono auth middleware
│   │   │   ├── policy/           # Policy engine
│   │   │   │   ├── engine.ts     # Core evaluation logic
│   │   │   │   ├── presets.ts    # Safe/Normal/Degen defaults
│   │   │   │   ├── assets.ts     # Bridge + memecoin detection
│   │   │   │   └── types.ts      # Policy type definitions
│   │   │   ├── providers/        # Signing provider adapters
│   │   │   │   ├── interface.ts  # SigningProvider interface
│   │   │   │   ├── para.ts       # Para implementation
│   │   │   │   ├── local.ts      # Dev/test provider
│   │   │   │   └── registry.ts   # Provider factory
│   │   │   ├── chains/           # Chain abstraction
│   │   │   │   ├── interface.ts  # ChainAdapter interface
│   │   │   │   ├── evm.ts        # viem-based EVM adapter
│   │   │   │   ├── solana.ts     # web3.js Solana adapter
│   │   │   │   ├── stellar.ts    # Stellar adapter (Privy)
│   │   │   │   └── registry.ts   # Chain registry
│   │   │   ├── api/              # REST routes
│   │   │   │   ├── agents.ts     # Agent CRUD
│   │   │   │   ├── tokens.ts     # Token management
│   │   │   │   ├── transactions.ts # Sign + status
│   │   │   │   ├── balances.ts   # Balance queries
│   │   │   │   ├── policies.ts   # Policy management
│   │   │   │   ├── approvals.ts  # Human approval flow
│   │   │   │   └── audit.ts      # Audit log queries
│   │   │   ├── db/
│   │   │   │   ├── schema.ts     # Drizzle schema
│   │   │   │   ├── index.ts      # Connection
│   │   │   │   └── migrate.ts    # Migrations
│   │   │   ├── audit/
│   │   │   │   └── logger.ts     # Audit event logging
│   │   │   └── index.ts          # Server entry point
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── sdk/                      # Agent-facing SDK
│   │   ├── src/
│   │   │   └── index.ts          # AgentPayClient class
│   │   └── package.json
│   ├── cli/                      # Human-facing CLI
│   │   ├── src/
│   │   │   ├── index.ts          # Entry point
│   │   │   └── commands/         # CLI commands
│   │   ├── package.json
│   │   └── bin/
│   │       └── agentpay.ts
│   └── dashboard/                # Policy dashboard (web UI)
│       ├── src/
│       ├── package.json
│       └── ...
├── AGENTPAY-SPEC.md
└── package.json                  # Monorepo root (workspaces)
```

---

## TODO / Roadmap

### MVP
- [x] Spec finalized
- [x] Core service (auth, policy, providers, chains, API)
- [x] Para provider (pregen wallets, EVM + Solana signing)
- [x] JWT auth with KMS signing
- [x] Policy engine with presets (safe/normal/degen) + bridging + memecoins
- [x] REST API (human + agent endpoints)
- [x] Balance query endpoints
- [x] Agent SDK
- [x] CLI (npx agentpay)
- [x] Policy dashboard (web UI)
- [x] Audit logging

### Post-MVP (P0.5)
- [x] WalletConnect v2 relay (server-side WC wallet)
- [x] Auto-refresh JWT tokens
- [x] MCP server for agent-native tool calls

### v2
- [ ] Turnkey provider
- [ ] Privy provider (Stellar)
- [ ] Token delegation (agent → sub-agent)
- [ ] Multi-tenant support
- [ ] Webhook notifications
- [ ] Analytics dashboard

### v3 (future)
- [ ] HSM provider (Apple Pay model)
- [ ] On-chain policy enforcement (Safe modules / ERC-4337)
- [ ] Cosmos chain support
