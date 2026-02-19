# Para (fka Capsule) - Deep Analysis for AI Agent Wallets

## Overview

**Para** (formerly Capsule) is a wallet-as-a-service platform that provides:
- MPC-based key management (Distributed Key Generation)
- Policy-based permissions system
- Multi-chain support (EVM, Solana, Cosmos)
- SOC 2 Type II certified
- Passkey integration for key share storage

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      PARA ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────────────┐                                           │
│   │    AI Agent     │                                           │
│   │   (API Client)  │                                           │
│   └────────┬────────┘                                           │
│            │                                                     │
│            ▼                                                     │
│   ┌─────────────────────────────────────────┐                   │
│   │           PARA SERVER                    │                   │
│   │                                          │                   │
│   │  ┌────────────────────────────────────┐ │                   │
│   │  │        POLICY ENGINE               │ │                   │
│   │  │                                    │ │                   │
│   │  │  Policy → Scopes → Permissions     │ │                   │
│   │  │                                    │ │                   │
│   │  │  • Value limits                    │ │                   │
│   │  │  • Address allowlists              │ │                   │
│   │  │  • Function-level restrictions     │ │                   │
│   │  │  • Chain restrictions              │ │                   │
│   │  └────────────────┬───────────────────┘ │                   │
│   │                   │                      │                   │
│   │                   ▼                      │                   │
│   │  ┌────────────────────────────────────┐ │                   │
│   │  │    MPC (Multi-Party Computation)   │ │                   │
│   │  │                                    │ │                   │
│   │  │  Key Shard 1 (Para Server)         │ │                   │
│   │  │           +                        │ │                   │
│   │  │  Key Shard 2 (User Device/Passkey) │ │                   │
│   │  │           =                        │ │                   │
│   │  │        Signature                   │ │                   │
│   │  │                                    │ │                   │
│   │  └────────────────────────────────────┘ │                   │
│   │                                          │                   │
│   └─────────────────────────────────────────┘                   │
│                                                                  │
│   Key Features:                                                  │
│   • Key shares can be rotated/refreshed                         │
│   • SOC 2 Type II compliant                                     │
│   • Passkey-based key share storage (secure enclave)            │
│   • Policy violations rejected BEFORE signing                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Para's Permission System (Critical for AI Agents)

Para's permission model is hierarchical:

```
Policy (app-level)
  └── Scopes (user-facing consent)
        └── Permissions (specific actions)
              └── Conditions (constraints)
```

### Example Policy for an AI Agent:

```json
{
  "policy": {
    "name": "AI Trading Agent",
    "chains": ["ethereum", "base", "arbitrum"],
    "scopes": [
      {
        "name": "Basic Wallet Actions",
        "required": true,
        "permissions": [
          {
            "type": "sign_message",
            "conditions": []
          }
        ]
      },
      {
        "name": "Automated Transfers",
        "required": false,
        "permissions": [
          {
            "type": "transfer",
            "conditions": [
              { "max_value": "100 USDC" },
              { "daily_limit": "500 USDC" },
              { "to_addresses": ["0xUniswap...", "0xAave..."] }
            ]
          }
        ]
      },
      {
        "name": "DEX Trading",
        "required": false,
        "permissions": [
          {
            "type": "contract_call",
            "conditions": [
              { "contracts": ["0xUniswapRouter..."] },
              { "functions": ["swap", "addLiquidity"] },
              { "max_value": "1000 USDC" }
            ]
          }
        ]
      }
    ]
  }
}
```

## Para vs Turnkey vs Others

| Feature | Para | Turnkey | Privy | Lit Protocol |
|---------|------|---------|-------|--------------|
| **Key Security** | MPC (2-of-2) | AWS Nitro Enclave | MPC | Threshold Network |
| **Policy Engine** | ✅ Rich (scopes, conditions) | ✅ Rich | ⚠️ Basic | ⚠️ On-chain only |
| **Passkey Support** | ✅ Native | ✅ Via integration | ✅ Native | ❌ No |
| **Multi-chain** | ✅ EVM, Solana, Cosmos | ✅ EVM, Solana | ✅ EVM, Solana | ✅ Multi-chain |
| **Server-side Signing** | ✅ Yes | ✅ Yes | ⚠️ Limited | ✅ Yes |
| **Decentralized** | ❌ No (trusted server) | ❌ No | ❌ No | ✅ Yes |
| **SOC 2** | ✅ Type II | ✅ Type II | ✅ Type II | ❌ N/A |
| **Audit** | ✅ Least Authority | ✅ NCC Group | ✅ Yes | ✅ Multiple |
| **Pricing** | Per-wallet + per-sig | Per-sig | Per-MAU | Per-sig |
| **AI Agent Focus** | ⚠️ Growing | ✅ Strong | ⚠️ Human-focused | ⚠️ Generic |

## Para Strengths for AI Agents

### 1. **Rich Policy Engine**
- Scoped permissions with conditions
- Value limits, address allowlists, function restrictions
- Policy violations rejected BEFORE signing
- Changes require new policy version (no silent escalation)

### 2. **Passkey + MPC Hybrid**
- User's key shard stored in secure enclave (passkey)
- Para's key shard in their infrastructure
- Neither party can sign alone
- But: Can enable "server-side signing" for autonomous operation

### 3. **Multi-Chain Native**
- EVM, Solana, Cosmos out of the box
- Same wallet, same policy across chains

### 4. **Server SDK**
- Node.js SDK for backend/agent integration
- Can sign programmatically within policy bounds

## Para Limitations for AI Agents

### 1. **MPC Requires Both Shards**
- Default model: User must be present (passkey)
- For autonomous agents: Need "delegated signing" mode
- Less clear documentation on fully autonomous operation

### 2. **Centralized Trust**
- Para server is a trusted party
- If Para goes down, signing stops
- Unlike Lit Protocol which is decentralized

### 3. **Policy Changes Require User Consent**
- Good for security, but means agent can't self-expand permissions
- Need to plan policy carefully upfront

### 4. **Less AI-Agent-Specific Documentation**
- Turnkey has clearer "programmatic signing" docs
- Para is more focused on human user onboarding UX

## Council Assessment

**Marcus (Security)**: "Para's MPC model is solid. The policy engine is actually more user-friendly than Turnkey's - scopes make sense to humans. My concern is the centralization - Para is a single point of failure."

**Sarah (Engineering)**: "The Server SDK looks good for integration. But I want to understand the 'delegated signing' flow better. Can an agent truly sign autonomously, or does it always need user presence?"

**David (Product)**: "Para's consent UI is beautiful - best-in-class for human onboarding. But for AI agents, we need to know: can we pre-approve a policy and then let the agent operate within it without further human interaction?"

## Key Question to Para

Before recommending Para, we need clarity on:

> **Can an AI agent sign transactions autonomously (without user presence) if operating within a pre-approved policy?**

If yes → Para is a strong contender
If no → Better suited for human-in-the-loop only

## Para vs Turnkey: Head-to-Head for AI Agents

| Criterion | Para | Turnkey | Winner |
|-----------|------|---------|--------|
| Key never extractable | ✅ MPC | ✅ Enclave | Tie |
| Policy engine richness | ✅ Scopes + conditions | ✅ Rich policies | Tie |
| Autonomous signing docs | ⚠️ Less clear | ✅ Clear | Turnkey |
| Human consent UX | ✅ Beautiful | ⚠️ Basic | Para |
| Multi-chain | ✅ EVM+Sol+Cosmos | ✅ EVM+Sol | Para |
| Decentralization | ❌ Centralized | ❌ Centralized | Tie |
| Pricing transparency | ⚠️ Contact sales | ✅ Public | Turnkey |
| Passkey integration | ✅ Native | ✅ Supported | Tie |

## Recommendation

**Para is a strong option IF**:
1. You need multi-chain (especially Cosmos)
2. You value beautiful human consent UX
3. You can confirm autonomous signing works

**Turnkey is better IF**:
1. You prioritize clear autonomous agent documentation
2. You want transparent pricing
3. You're EVM/Solana only

**Use Both?**
- Para for human-facing onboarding
- Turnkey for agent-facing signing
- (Complex but possible)

---

## Updated Provider Comparison

| Provider | Autonomy | Policy | Security | Multi-Chain | AI Focus | Pricing |
|----------|----------|--------|----------|-------------|----------|---------|
| **Para** | ⚠️ Unclear | ✅ Rich | ✅ MPC+SOC2 | ✅ Best | ⚠️ Growing | $$ |
| **Turnkey** | ✅ Clear | ✅ Rich | ✅ Enclave+SOC2 | ✅ Good | ✅ Strong | $$ |
| **Privy** | ⚠️ Limited | ⚠️ Basic | ✅ MPC | ✅ Good | ❌ Human | $$ |
| **Lit** | ✅ Yes | ⚠️ On-chain | ✅ Threshold | ✅ Good | ⚠️ Generic | $ |
| **Safe+Session** | ✅ Yes | ✅ On-chain | ✅ User-controlled | ⚠️ EVM only | ⚠️ Generic | Gas |
| **Fireblocks** | ✅ Yes | ✅ Rich | ✅ Best | ✅ Best | ✅ Strong | $$$$ |
