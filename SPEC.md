# AI Agent Wallet Specification

**Version**: 1.0.0-draft  
**Date**: February 4, 2026  
**Status**: Ready for Review

---

## Executive Summary

A secure wallet infrastructure for AI agents to transact on-chain without risk of private key exposure. Supports both Para and Turnkey as signing backends, with passkey-based human oversight and configurable policy enforcement.

---

## Requirements Summary

| Requirement | Value |
|-------------|-------|
| Key Infrastructure | Para + Turnkey (dual support) |
| Autonomy Model | Fully autonomous within policy, threshold/policy fallbacks |
| Target Chains | EVM + Solana |
| Account Abstraction | Hybrid (AA where available, EOA fallback) |
| Human Oversight | Passkey as admin root-of-trust |
| Policy Enforcement | Off-chain (MVP) |
| Cross-Chain | Separate wallets per chain (no bridging) |
| Default Autonomous Limit | $100 per transaction (configurable) |
| Contract Interaction | Allowlist only |
| Deployment Model | Single user (MVP), multi-tenant (TODO) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        AI AGENT WALLET SYSTEM                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌─────────────────┐                                                       │
│   │    AI Agent     │                                                       │
│   │   (Claude, etc) │                                                       │
│   │                 │                                                       │
│   │  ⚠️ NO KEYS     │                                                       │
│   └────────┬────────┘                                                       │
│            │                                                                 │
│            │ Sign Request (transaction intent)                              │
│            ▼                                                                 │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                    WALLET SERVICE (Your Backend)             │          │
│   │                                                              │          │
│   │  ┌────────────────────────────────────────────────────────┐ │          │
│   │  │                   POLICY ENGINE                        │ │          │
│   │  │                                                        │ │          │
│   │  │  1. Validate contract is in allowlist                  │ │          │
│   │  │  2. Check transaction value ≤ autonomous limit         │ │          │
│   │  │  3. Check daily/weekly aggregate limits                │ │          │
│   │  │  4. Check rate limits                                  │ │          │
│   │  │  5. Validate function selector if applicable           │ │          │
│   │  │                                                        │ │          │
│   │  └──────────────────────┬─────────────────────────────────┘ │          │
│   │                         │                                    │          │
│   │            ┌────────────┴────────────┐                      │          │
│   │            ▼                         ▼                      │          │
│   │   ┌───────────────┐         ┌───────────────┐              │          │
│   │   │  AUTO-APPROVE │         │ HUMAN-APPROVE │              │          │
│   │   │  (≤ $100)     │         │  (> $100)     │              │          │
│   │   └───────┬───────┘         └───────┬───────┘              │          │
│   │           │                         │                       │          │
│   │           │                         ▼                       │          │
│   │           │                 ┌───────────────┐               │          │
│   │           │                 │   PASSKEY     │               │          │
│   │           │                 │   APPROVAL    │               │          │
│   │           │                 │  (Biometric)  │               │          │
│   │           │                 └───────┬───────┘               │          │
│   │           │                         │                       │          │
│   │           └────────────┬────────────┘                       │          │
│   │                        ▼                                    │          │
│   │  ┌────────────────────────────────────────────────────────┐│          │
│   │  │              SIGNING PROVIDER ADAPTER                  ││          │
│   │  │                                                        ││          │
│   │  │  ┌──────────────┐              ┌──────────────┐       ││          │
│   │  │  │    PARA      │              │   TURNKEY    │       ││          │
│   │  │  │              │              │              │       ││          │
│   │  │  │ • MPC Signing│      OR      │ • Enclave    │       ││          │
│   │  │  │ • Policy API │              │ • Policy API │       ││          │
│   │  │  └──────────────┘              └──────────────┘       ││          │
│   │  │                                                        ││          │
│   │  └────────────────────────────────────────────────────────┘│          │
│   │                                                              │          │
│   └──────────────────────────────┬───────────────────────────────┘          │
│                                  │                                          │
│                                  ▼                                          │
│   ┌─────────────────────────────────────────────────────────────┐          │
│   │                      BLOCKCHAIN                              │          │
│   │                                                              │          │
│   │    EVM Chains              │         Solana                 │          │
│   │  ┌─────────────────┐       │    ┌─────────────────┐        │          │
│   │  │ Smart Contract  │       │    │   Program       │        │          │
│   │  │ Wallet (4337)   │       │    │   (Native)      │        │          │
│   │  │ OR EOA          │       │    │                 │        │          │
│   │  └─────────────────┘       │    └─────────────────┘        │          │
│   │                            │                                │          │
│   └─────────────────────────────────────────────────────────────┘          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### 1. Wallet Service (Core Backend)

**Purpose**: Mediates between AI agent and signing providers. Enforces policies. Never holds private keys.

**Technology**: Node.js/TypeScript

**Responsibilities**:
- Receive transaction requests from agent
- Validate against policy engine
- Route to appropriate signing provider
- Handle human approval flow when needed
- Maintain audit logs

#### API Endpoints

```typescript
// Transaction request from agent
POST /api/v1/transactions/sign
{
  chainId: number | string,        // e.g., 1 for Ethereum, "solana-mainnet"
  to: string,                      // Contract or recipient address
  value: string,                   // Value in wei/lamports
  data?: string,                   // Calldata for contract calls
  functionName?: string,           // Human-readable function name
  functionArgs?: any[],            // Decoded arguments
  urgency: "low" | "medium" | "high",
  reason: string                   // Agent's explanation for the transaction
}

// Response
{
  status: "approved" | "pending_human" | "rejected",
  transactionHash?: string,        // If approved and broadcast
  approvalUrl?: string,            // If pending human approval
  rejectionReason?: string,        // If rejected
  auditId: string                  // For tracking
}

// Check transaction status
GET /api/v1/transactions/:auditId

// Get current policy
GET /api/v1/policy

// Request allowlist addition (creates TODO)
POST /api/v1/allowlist/request
{
  contractAddress: string,
  chainId: number | string,
  reason: string,
  functions?: string[]             // Specific functions to allow
}
```

---

### 2. Policy Engine

**Purpose**: Evaluate every transaction against configurable rules before signing.

#### Policy Schema

```typescript
interface Policy {
  version: string;
  updatedAt: number;
  updatedBy: string;  // Passkey identifier
  
  globalLimits: {
    maxTransactionValue: string;      // Default: "100 USD"
    dailyLimit: string;               // Default: "1000 USD"
    weeklyLimit: string;              // Default: "5000 USD"
    maxTransactionsPerHour: number;   // Default: 20
    maxTransactionsPerDay: number;    // Default: 100
  };
  
  autonomousThreshold: string;        // Default: "100 USD"
  
  chains: {
    [chainId: string]: ChainPolicy;
  };
  
  contractAllowlist: ContractAllowlistEntry[];
  
  blocklist: {
    addresses: string[];              // Known scam addresses
    contracts: string[];              // Known malicious contracts
  };
}

interface ChainPolicy {
  enabled: boolean;
  walletType: "eoa" | "smart_contract" | "hybrid";
  smartContractAddress?: string;      // If using AA
  rpcEndpoints: string[];             // Verified RPC URLs
  nativeTokenSymbol: string;
  
  overrides?: {
    maxTransactionValue?: string;
    autonomousThreshold?: string;
  };
}

interface ContractAllowlistEntry {
  address: string;
  chainId: string;
  name: string;                       // Human-readable name
  type: "dex" | "lending" | "nft" | "bridge" | "other";
  addedAt: number;
  addedBy: string;
  
  allowedFunctions?: {
    selector: string;                 // e.g., "0x38ed1739"
    name: string;                     // e.g., "swapExactTokensForTokens"
    maxValue?: string;                // Function-specific limit
  }[];
  
  maxApprovalAmount?: string;         // For ERC20 approvals
  notes?: string;
}
```

#### Policy Evaluation Flow

```typescript
async function evaluateTransaction(tx: TransactionRequest): Promise<PolicyResult> {
  // Step 1: Check blocklist
  if (isBlocked(tx.to)) {
    return { allowed: false, reason: "Address is blocklisted" };
  }
  
  // Step 2: Check allowlist
  const allowlistEntry = getAllowlistEntry(tx.to, tx.chainId);
  if (!allowlistEntry) {
    return { 
      allowed: false, 
      reason: "Contract not in allowlist",
      action: "request_allowlist_addition"
    };
  }
  
  // Step 3: Check function selector (if contract call)
  if (tx.data && allowlistEntry.allowedFunctions) {
    const selector = tx.data.slice(0, 10);
    const allowedFunc = allowlistEntry.allowedFunctions.find(f => f.selector === selector);
    if (!allowedFunc) {
      return { allowed: false, reason: "Function not allowed for this contract" };
    }
  }
  
  // Step 4: Check transaction value
  const valueUsd = await convertToUsd(tx.value, tx.chainId);
  const chainPolicy = policy.chains[tx.chainId];
  const maxValue = chainPolicy?.overrides?.maxTransactionValue || policy.globalLimits.maxTransactionValue;
  
  if (valueUsd > parseUsd(maxValue)) {
    return { allowed: false, reason: `Transaction exceeds max value (${maxValue})` };
  }
  
  // Step 5: Check aggregate limits
  const dailySpent = await getDailySpend();
  if (dailySpent + valueUsd > parseUsd(policy.globalLimits.dailyLimit)) {
    return { allowed: false, reason: "Daily limit exceeded" };
  }
  
  // Step 6: Check rate limits
  const hourlyCount = await getHourlyTransactionCount();
  if (hourlyCount >= policy.globalLimits.maxTransactionsPerHour) {
    return { allowed: false, reason: "Hourly rate limit exceeded" };
  }
  
  // Step 7: Determine approval mode
  const autonomousThreshold = chainPolicy?.overrides?.autonomousThreshold || policy.autonomousThreshold;
  
  if (valueUsd <= parseUsd(autonomousThreshold)) {
    return { allowed: true, requiresHumanApproval: false };
  } else {
    return { allowed: true, requiresHumanApproval: true };
  }
}
```

---

### 3. Signing Provider Adapter

**Purpose**: Abstract Para and Turnkey behind a common interface.

```typescript
interface SigningProvider {
  name: "para" | "turnkey";
  
  // Initialize with credentials
  initialize(config: ProviderConfig): Promise<void>;
  
  // Get wallet address for a chain
  getAddress(chainId: string): Promise<string>;
  
  // Sign a transaction (provider enforces its own policies too)
  signTransaction(tx: SignableTransaction): Promise<SignedTransaction>;
  
  // Sign a message
  signMessage(message: string): Promise<string>;
  
  // Check provider health
  healthCheck(): Promise<boolean>;
}

// Para implementation
class ParaProvider implements SigningProvider {
  name = "para" as const;
  private client: ParaClient;
  
  async initialize(config: ParaConfig) {
    this.client = new Para({
      apiKey: config.apiKey,
      environment: config.environment
    });
  }
  
  async signTransaction(tx: SignableTransaction) {
    // Para's policy engine also validates
    return this.client.signTransaction({
      chainId: tx.chainId,
      transaction: tx.rawTransaction
    });
  }
}

// Turnkey implementation
class TurnkeyProvider implements SigningProvider {
  name = "turnkey" as const;
  private client: TurnkeyClient;
  
  async initialize(config: TurnkeyConfig) {
    this.client = new TurnkeyClient({
      apiPrivateKey: config.apiPrivateKey,
      apiPublicKey: config.apiPublicKey,
      organizationId: config.organizationId
    });
  }
  
  async signTransaction(tx: SignableTransaction) {
    // Turnkey's policy engine also validates
    return this.client.signTransaction({
      organizationId: this.config.organizationId,
      signWith: tx.chainId.startsWith("solana") ? this.solanaWalletId : this.evmWalletId,
      type: "TRANSACTION",
      unsignedTransaction: tx.rawTransaction
    });
  }
}
```

---

### 4. Human Approval System

**Purpose**: Passkey-based approval for transactions exceeding autonomous threshold.

#### Flow

```
Agent requests tx > $100
        │
        ▼
Policy Engine marks as "pending_human"
        │
        ▼
Create approval request in DB
        │
        ▼
Send push notification / email to admin
        │
        ▼
Admin opens approval URL
        │
        ▼
Display transaction details:
  • From: 0x1234...
  • To: Uniswap Router (verified ✓)
  • Action: Swap 150 USDC → ETH
  • Value: $150
  • Agent reason: "Executing DCA strategy"
        │
        ▼
Admin authenticates with Passkey (biometric)
        │
        ▼
Approval recorded, transaction signed
```

#### Approval UI Data

```typescript
interface ApprovalRequest {
  id: string;
  createdAt: number;
  expiresAt: number;                  // 15 minutes by default
  status: "pending" | "approved" | "rejected" | "expired";
  
  transaction: {
    chainId: string;
    chainName: string;
    from: string;
    to: string;
    toName?: string;                  // From allowlist
    toVerified: boolean;              // Is in allowlist
    value: string;
    valueUsd: string;
    functionName?: string;
    functionArgs?: any[];
    estimatedGas?: string;
    estimatedGasUsd?: string;
  };
  
  agent: {
    reason: string;                   // Agent's explanation
    sessionId?: string;
    conversationContext?: string;     // Last few messages
  };
  
  policy: {
    autonomousThreshold: string;
    whyHumanRequired: string;         // e.g., "Value exceeds $100 threshold"
  };
}
```

---

### 5. Audit Logging

**Purpose**: Immutable record of all transaction requests for forensics and compliance.

```typescript
interface AuditLog {
  id: string;
  timestamp: number;
  
  request: {
    chainId: string;
    to: string;
    value: string;
    data?: string;
    agentReason: string;
    agentSessionId?: string;
  };
  
  policyEvaluation: {
    allowed: boolean;
    requiresHumanApproval: boolean;
    reason?: string;
    evaluatedRules: {
      rule: string;
      result: boolean;
      details?: string;
    }[];
  };
  
  approval?: {
    type: "autonomous" | "human";
    approvedBy?: string;              // Passkey identifier if human
    approvedAt: number;
  };
  
  signing?: {
    provider: "para" | "turnkey";
    success: boolean;
    transactionHash?: string;
    error?: string;
  };
  
  blockchain?: {
    submitted: boolean;
    confirmed: boolean;
    blockNumber?: number;
    gasUsed?: string;
  };
}
```

---

### 6. Contract Allowlist Management

**Purpose**: Maintain curated list of safe contracts for agent interaction.

#### Initial Allowlist (MVP)

```typescript
const INITIAL_ALLOWLIST: ContractAllowlistEntry[] = [
  // Ethereum Mainnet
  {
    address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
    chainId: "1",
    name: "Uniswap V2 Router",
    type: "dex",
    allowedFunctions: [
      { selector: "0x38ed1739", name: "swapExactTokensForTokens" },
      { selector: "0x8803dbee", name: "swapTokensForExactTokens" },
      { selector: "0x7ff36ab5", name: "swapExactETHForTokens" },
      { selector: "0x18cbafe5", name: "swapExactTokensForETH" }
    ]
  },
  {
    address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    chainId: "1",
    name: "Uniswap V3 Router",
    type: "dex",
    allowedFunctions: [
      { selector: "0x04e45aaf", name: "exactInputSingle" },
      { selector: "0x5023b4df", name: "exactOutputSingle" }
    ]
  },
  {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    chainId: "1",
    name: "USDC",
    type: "other",
    allowedFunctions: [
      { selector: "0xa9059cbb", name: "transfer" },
      { selector: "0x095ea7b3", name: "approve", maxValue: "1000000" }  // Max 1M USDC approval
    ]
  },
  
  // Base
  {
    address: "0x2626664c2603336E57B271c5C0b26F421741e481",
    chainId: "8453",
    name: "Uniswap V3 Router (Base)",
    type: "dex"
  },
  
  // Arbitrum
  {
    address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
    chainId: "42161",
    name: "Uniswap V3 Router (Arbitrum)",
    type: "dex"
  },
  
  // Solana - TODO: Different address format and program model
];
```

#### Allowlist Addition Request Flow

```
Agent tries to interact with unlisted contract
        │
        ▼
Policy rejects with "Contract not in allowlist"
        │
        ▼
Agent (or system) creates allowlist request:
  POST /api/v1/allowlist/request
  {
    contractAddress: "0xNewContract...",
    chainId: "1",
    reason: "Agent needs to interact with Aave for lending strategy",
    functions: ["supply", "withdraw"]
  }
        │
        ▼
System creates TODO item for human review
        │
        ▼
Human reviews:
  • Contract verified on Etherscan? ✓
  • Known protocol? ✓
  • Audit reports? ✓
  • TVL/reputation? ✓
        │
        ▼
Human approves via Passkey
        │
        ▼
Contract added to allowlist
        │
        ▼
Agent can now interact with contract
```

---

## Chain Support

### EVM Chains (MVP)

| Chain | Chain ID | Wallet Type | Status |
|-------|----------|-------------|--------|
| Ethereum | 1 | Hybrid (prefer AA) | MVP |
| Base | 8453 | Hybrid | MVP |
| Arbitrum | 42161 | Hybrid | MVP |
| Optimism | 10 | Hybrid | TODO |
| Polygon | 137 | Hybrid | TODO |

### Solana (MVP)

| Network | Wallet Type | Status |
|---------|-------------|--------|
| Mainnet-beta | Native (no AA) | MVP |
| Devnet | Native | MVP |

### Account Abstraction Strategy

```typescript
async function getWalletForChain(chainId: string): Promise<WalletInfo> {
  const chainConfig = policy.chains[chainId];
  
  if (chainConfig.walletType === "smart_contract" || chainConfig.walletType === "hybrid") {
    // Try to use AA if available
    if (chainConfig.smartContractAddress) {
      return {
        type: "smart_contract",
        address: chainConfig.smartContractAddress,
        supports: ["session_keys", "spending_limits", "batching"]
      };
    }
  }
  
  // Fallback to EOA
  const address = await signingProvider.getAddress(chainId);
  return {
    type: "eoa",
    address,
    supports: []
  };
}
```

---

## Security Measures

### Defense in Depth

| Layer | Control | Purpose |
|-------|---------|---------|
| 1 | Contract Allowlist | Only interact with known-safe contracts |
| 2 | Function Allowlist | Only call specific functions |
| 3 | Value Limits | Cap per-tx and aggregate spending |
| 4 | Rate Limits | Prevent rapid drain attacks |
| 5 | Human Approval | High-value requires passkey |
| 6 | Provider Policies | Para/Turnkey enforce their own rules |
| 7 | Audit Logging | Full forensic trail |

### What If Agent is Compromised?

| Attack | Mitigation |
|--------|------------|
| Agent tries to send to attacker address | Blocked - not in allowlist |
| Agent tries to call malicious function | Blocked - function not in allowlist |
| Agent tries to drain wallet | Blocked - exceeds daily limit |
| Agent tries many small transactions | Blocked - rate limit exceeded |
| Agent tries to approve unlimited tokens | Blocked - max approval limit |
| Agent extracts private key | Impossible - key never in agent context |

---

## Data Storage

### Database Schema (PostgreSQL)

```sql
-- Policies (versioned)
CREATE TABLE policies (
  id UUID PRIMARY KEY,
  version VARCHAR(20) NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255) NOT NULL  -- Passkey identifier
);

-- Contract Allowlist
CREATE TABLE contract_allowlist (
  id UUID PRIMARY KEY,
  address VARCHAR(255) NOT NULL,
  chain_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  allowed_functions JSONB,
  max_approval_amount VARCHAR(255),
  added_at TIMESTAMP DEFAULT NOW(),
  added_by VARCHAR(255) NOT NULL,
  notes TEXT,
  UNIQUE(address, chain_id)
);

-- Allowlist Requests (TODOs)
CREATE TABLE allowlist_requests (
  id UUID PRIMARY KEY,
  contract_address VARCHAR(255) NOT NULL,
  chain_id VARCHAR(50) NOT NULL,
  reason TEXT NOT NULL,
  requested_functions JSONB,
  status VARCHAR(20) DEFAULT 'pending',  -- pending, approved, rejected
  requested_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by VARCHAR(255),
  review_notes TEXT
);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  request JSONB NOT NULL,
  policy_evaluation JSONB NOT NULL,
  approval JSONB,
  signing JSONB,
  blockchain JSONB
);

-- Pending Approvals
CREATE TABLE pending_approvals (
  id UUID PRIMARY KEY,
  audit_log_id UUID REFERENCES audit_logs(id),
  expires_at TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  approved_by VARCHAR(255),
  approved_at TIMESTAMP
);

-- Spending Tracking
CREATE TABLE spending_tracking (
  id UUID PRIMARY KEY,
  chain_id VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  total_usd DECIMAL(20, 2) DEFAULT 0,
  transaction_count INTEGER DEFAULT 0,
  UNIQUE(chain_id, date)
);
```

---

## Configuration

### Environment Variables

```bash
# Signing Providers
PARA_API_KEY=your_para_api_key
PARA_ENVIRONMENT=production  # or sandbox

TURNKEY_API_PUBLIC_KEY=your_turnkey_public_key
TURNKEY_API_PRIVATE_KEY=your_turnkey_private_key
TURNKEY_ORGANIZATION_ID=your_org_id

# Which provider to use (can be switched)
SIGNING_PROVIDER=para  # or turnkey

# Database
DATABASE_URL=postgresql://user:pass@host:5432/ai_wallet

# Passkey / WebAuthn
WEBAUTHN_RP_ID=yourdomain.com
WEBAUTHN_RP_NAME=AI Wallet Admin

# Notifications
NOTIFICATION_WEBHOOK_URL=https://your-notification-service/webhook

# Price Oracle
PRICE_ORACLE_API_KEY=your_coingecko_or_similar_key
```

### Default Policy (policy.default.json)

```json
{
  "version": "1.0.0",
  "globalLimits": {
    "maxTransactionValue": "1000 USD",
    "dailyLimit": "5000 USD",
    "weeklyLimit": "20000 USD",
    "maxTransactionsPerHour": 20,
    "maxTransactionsPerDay": 100
  },
  "autonomousThreshold": "100 USD",
  "chains": {
    "1": {
      "enabled": true,
      "walletType": "hybrid",
      "rpcEndpoints": ["https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"],
      "nativeTokenSymbol": "ETH"
    },
    "8453": {
      "enabled": true,
      "walletType": "hybrid",
      "rpcEndpoints": ["https://base-mainnet.g.alchemy.com/v2/YOUR_KEY"],
      "nativeTokenSymbol": "ETH"
    },
    "42161": {
      "enabled": true,
      "walletType": "hybrid",
      "rpcEndpoints": ["https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY"],
      "nativeTokenSymbol": "ETH"
    },
    "solana-mainnet": {
      "enabled": true,
      "walletType": "eoa",
      "rpcEndpoints": ["https://api.mainnet-beta.solana.com"],
      "nativeTokenSymbol": "SOL"
    }
  },
  "blocklist": {
    "addresses": [],
    "contracts": []
  }
}
```

---

## API for AI Agents

### Agent SDK (TypeScript)

```typescript
import { AIWalletClient } from '@your-org/ai-wallet-sdk';

const wallet = new AIWalletClient({
  endpoint: 'https://wallet-service.yourdomain.com',
  agentId: 'agent-123',
  apiKey: process.env.WALLET_API_KEY
});

// Simple transfer
const result = await wallet.transfer({
  chainId: '1',
  to: '0xRecipient...',
  amount: '50',
  token: 'USDC',
  reason: 'Payment for service X'
});

// Swap on DEX
const swapResult = await wallet.swap({
  chainId: '1',
  fromToken: 'USDC',
  toToken: 'ETH',
  amount: '100',
  slippage: 0.5,
  reason: 'Rebalancing portfolio per strategy'
});

// Check if contract is allowed
const canInteract = await wallet.canInteract({
  chainId: '1',
  contractAddress: '0xSomeContract...',
  functionName: 'deposit'
});

if (!canInteract.allowed) {
  // Request allowlist addition
  await wallet.requestAllowlist({
    contractAddress: '0xSomeContract...',
    chainId: '1',
    reason: 'Need to interact with Aave for yield strategy',
    functions: ['deposit', 'withdraw']
  });
}

// Get current limits
const limits = await wallet.getLimits();
console.log(`Daily remaining: $${limits.dailyRemaining}`);
console.log(`Can auto-approve up to: $${limits.autonomousThreshold}`);
```

---

## TODO Items

### MVP (v1.0)
- [ ] Core wallet service with policy engine
- [ ] Para integration
- [ ] Turnkey integration
- [ ] Passkey-based human approval
- [ ] Basic contract allowlist (major DEXs, stablecoins)
- [ ] EVM support (Ethereum, Base, Arbitrum)
- [ ] Solana support
- [ ] Audit logging
- [ ] Agent SDK

### Post-MVP (v1.1)
- [ ] Multi-tenant support (multiple users/agents)
- [ ] On-chain policy enforcement (Safe modules)
- [ ] More chains (Optimism, Polygon)
- [ ] Advanced allowlist management UI
- [ ] Analytics dashboard
- [ ] Webhook notifications for transactions

### Future (v2.0)
- [ ] Account abstraction with session keys
- [ ] Spending categories and budgets
- [ ] DeFi strategy templates
- [ ] Multi-sig support for high-value
- [ ] Cosmos chain support (via Para)

---

## Risk Acknowledgments

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Prompt injection bypasses agent | Medium | High | Agent never has keys |
| Para/Turnkey service outage | Low | High | Support both, can switch |
| Policy misconfiguration | Medium | Medium | Human reviews policy changes |
| Allowlist includes malicious contract | Low | High | Verification checklist |
| Price oracle manipulation | Low | Medium | Multiple oracle sources |
| Human approver compromised | Low | High | Hardware key option for high-value |

---

## Success Criteria

| Metric | Target |
|--------|--------|
| Agent can sign transactions | ✓ Works |
| Private key never exposed to agent | ✓ Verified |
| Transactions within policy auto-approved | < 2s latency |
| Human approval flow works | < 30s end-to-end |
| All transactions logged | 100% |
| Allowlist protects against unknown contracts | ✓ Verified |

---

## Appendix A: Provider Research Findings

### Autonomous Signing Capability - CONFIRMED

Both Para and Turnkey support autonomous server-side signing for AI agents.

#### Para (formerly Capsule) - Autonomous Signing

**Status**: ✅ SUPPORTED via Pregenerated Wallets

**How it works**:
1. Create wallet server-side using `createPregenWallet()`
2. Store the user share encrypted in your database
3. Load share and sign autonomously without user interaction

```typescript
// 1. Create agent wallet (one-time setup)
const paraServer = new ParaServer(apiKey);
await paraServer.createPregenWallet({
  type: 'EVM',
  pregenId: { customId: "ai-agent-001" }
});

// 2. Store user share (encrypted)
const userShare = await paraServer.getUserShare();
await database.storeEncrypted('ai-agent-001', userShare);

// 3. Sign autonomously when needed
async function agentSignTransaction(txData) {
  const paraServer = new ParaServer(apiKey);
  const userShare = await database.getDecrypted('ai-agent-001');
  await paraServer.setUserShare(userShare);
  
  return await paraServer.signTransaction({
    walletId: agentWalletId,
    rlpEncodedTxBase64: txData,
    chainId: '1'
  });
}
```

**Limitations**:
- Policy configuration requires contacting Para team (not self-service)
- User share must be stored securely (if lost, wallet is permanently inaccessible)
- Create new Para client instance for each request

**Documentation**: [docs.getpara.com/v2/server/guides/pregen](https://docs.getpara.com/v2/server/guides/pregen)

---

#### Turnkey - Autonomous Signing

**Status**: ✅ SUPPORTED via API Keys with self-service policy engine

**How it works**:
1. Create API key pair for your backend
2. Configure policies in Turnkey dashboard (self-service)
3. Sign transactions programmatically via API

```typescript
import { Turnkey } from "@turnkey/sdk-server";

const turnkey = new Turnkey({
  apiBaseUrl: "https://api.turnkey.com",
  apiPublicKey: process.env.TURNKEY_API_PUBLIC_KEY,
  apiPrivateKey: process.env.TURNKEY_API_PRIVATE_KEY,
  defaultOrganizationId: process.env.TURNKEY_ORGANIZATION_ID
});

// Sign transaction autonomously (policy engine validates automatically)
const { activity } = await turnkey.apiClient().signTransaction({
  signWith: walletAddress,
  unsignedTransaction: rawTx,
  type: "TRANSACTION_TYPE_ETHEREUM"
});
```

**Policy Configuration** (JSON-based, self-service):
```json
{
  "effect": "EFFECT_ALLOW",
  "consensus": "approvers.any(user, user.tags.contains('ai-agent'))",
  "condition": "eth.tx.value <= 100000000000000000 && eth.tx.to in ['0xRecipient1', '0xRecipient2']"
}
```

**Advantages**:
- Self-service policy configuration
- Rich policy language (CEL-like expressions)
- No rate limits documented
- Clear autonomous agent documentation

**Documentation**: [docs.turnkey.com](https://docs.turnkey.com)

---

### Provider Comparison Summary

| Feature | Para | Turnkey |
|---------|------|---------|
| Autonomous Signing | ✅ Yes (Pregen Wallets) | ✅ Yes (API Keys) |
| Policy Self-Service | ❌ Contact team | ✅ Dashboard + API |
| Key Security | MPC (2-of-2) | AWS Nitro Enclave |
| Multi-Chain | EVM, Solana, Cosmos | EVM, Solana |
| SOC 2 Type II | ✅ Yes | ✅ Yes |
| Signing Latency | ~200-500ms | ~100-300ms |
| AI Agent Focus | Growing | Strong |

**Recommendation**: 
- Use **Turnkey** for MVP (self-service policies, clearer docs)
- Consider **Para** if you need Cosmos support or prefer MPC model

---

## Appendix B: Provider Setup

### Para Setup

1. Create account at [developer.getpara.com](https://developer.getpara.com)
2. Create new application
3. Email hello@getpara.com to configure policy scopes for autonomous agent use
4. Generate API key from dashboard
5. Use Pregenerated Wallets for autonomous signing (not session transfer)

### Turnkey Setup

1. Create account at [app.turnkey.com](https://app.turnkey.com)
2. Create organization
3. Create API key pair (P-256 recommended)
4. Create wallet(s) for EVM and Solana
5. Configure policies in Turnkey dashboard:
   - Set spending limits
   - Define address allowlists
   - Configure rate limits
6. Use `@turnkey/sdk-server` for backend integration
