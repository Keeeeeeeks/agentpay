# Deep Dive: Passkeys & Cloud Embedded Wallets for AI Agents

## Council Reconvenes

**Marcus**: "I dismissed passkeys too quickly. There's nuance here."

**Sarah**: "And embedded wallets have evolved significantly. Turnkey, Privy, Dynamic - they're not just 'custodial wallets with extra steps' anymore."

**David**: "The key question is: can these work for *autonomous* agents, or only human-in-the-loop?"

---

## Passkeys (WebAuthn) - Detailed Analysis

### How Passkeys Work

```
┌─────────────────────────────────────────────────────────────────┐
│                        PASSKEY FLOW                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   1. Registration                                               │
│   ┌──────────┐      ┌──────────────┐      ┌──────────────┐      │
│   │  User    │─────▶│   Browser    │─────▶│Secure Enclave│      │
│   │          │      │  (WebAuthn)  │      │  (TPM/SE)    │      │
│   └──────────┘      └──────────────┘      └──────┬───────┘      │
│                                                  │              │
│                           Public Key ◀───────────┘              │
│                           (stored on server)                    │
│                                                                 │
│   2. Signing                                                    │
│   ┌──────────┐      ┌──────────────┐      ┌──────────────┐      │
│   │Challenge │─────▶│  Biometric   │─────▶│Secure Enclave│      │
│   │          │      │  (Face/Touch)│      │   Signs      │      │
│   └──────────┘      └──────────────┘      └──────┬───────┘      │
│                                                  │              │
│                           Signature ◀────────────┘              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Passkey Properties

| Property | Value | Implication for AI Agents |
|----------|-------|---------------------------|
| Key extraction | **Impossible** | ✅ Key can never leak to LLM |
| User presence | **Required** | ❌ Breaks full autonomy |
| Phishing resistance | **Yes** | ✅ Origin-bound |
| Cross-device | **Via cloud sync** | ⚠️ iCloud/Google dependency |
| Programmatic access | **No** | ❌ Can't sign without human |

### The Autonomy Problem

**David**: "Here's the fundamental issue. Passkeys are designed to REQUIRE user presence. That's the security model. An AI agent can't just 'use' a passkey autonomously."

**Marcus**: "Unless... we decouple the passkey from the signing authority."

### Passkey Hybrid Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                 PASSKEY + SESSION KEY HYBRID                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   HUMAN (Passkey)                    AGENT (Session Key)        │
│   ┌─────────────────┐               ┌─────────────────┐         │
│   │                 │               │                 │         │
│   │  • Full control │               │  • Limited      │         │
│   │  • Grants       │──────────────▶│  • Time-bound   │         │
│   │    sessions     │   Creates     │  • Revocable    │         │
│   │  • Revokes      │               │  • Capped       │         │
│   │                 │               │                 │         │
│   └────────┬────────┘               └────────┬────────┘         │
│            │                                 │                  │
│            │  High-value tx                  │  Low-value tx    │
│            │  Policy changes                 │  Within policy   │
│            ▼                                 ▼                  │
│   ┌─────────────────────────────────────────────────────────────┐
│   │              Smart Contract Wallet (ERC-4337)               │
│   │                                                             │
│   │  • Validates session key permissions on-chain               │
│   │  • Enforces spending limits                                 │
│   │  • Human can revoke session instantly via passkey           │
│   └─────────────────────────────────────────────────────────────┘
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Sarah**: "This is actually elegant. The passkey is the 'root of trust' but delegates limited authority to the agent."

**Marcus**: "And if the session key is compromised, the attacker can only do what the session key allows - which is capped and time-limited."

### Passkey-Compatible Wallet Providers

| Provider | Passkey Support | Session Keys | On-Chain Enforcement | Notes |
|----------|-----------------|--------------|----------------------|-------|
| **Coinbase Smart Wallet** | ✅ Native     | ✅ Yes                | ✅ ERC-4337 | Best passkey UX |
| **Safe + Passkey Module** | ✅ Via module | ✅ Yes                | ✅ Safe | Battle-tested |
| **ZeroDev** | ✅ Yes | ✅ Yes | ✅ ERC-4337                       | Developer focused |
| **Biconomy** | ✅ Yes | ✅ Yes | ✅ ERC-4337 | Good SDK |
| **Privy** | ✅ Yes | ⚠️ Limited | ⚠️ Depends | See embedded section |

---

## Cloud Embedded Wallets - Detailed Analysis

### What Are Embedded Wallets?

Embedded wallets are wallet-as-a-service solutions where:
- Keys are generated and stored in cloud infrastructure
- Users authenticate via familiar methods (email, social, passkey)
- Signing can happen without explicit user action (depending on config)

### The Landscape

```
┌─────────────────────────────────────────────────────────────────┐
│              EMBEDDED WALLET ARCHITECTURE SPECTRUM              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   CUSTODIAL                                        NON-CUSTODIAL│
│   ◀────────────────────────────────────────────────────────────▶│
│                                                                 │
│   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐         │
│   │ Circle  │   │  Privy  │   │ Turnkey │   │ Lit     │         │
│   │         │   │         │   │         │   │Protocol │         │
│   ├─────────┤   ├─────────┤   ├─────────┤   ├─────────┤         │
│   │Provider │   │Provider │   │User+    │   │Network  │         │
│   │has key  │   │has shard│   │Provider │   │has      │         │
│   │         │   │         │   │have     │   │shards   │         │
│   │         │   │         │   │shards   │   │         │         │
│   └─────────┘   └─────────┘   └─────────┘   └─────────┘         │
│                                                                 │
│   Simpler ◀──────────────────────────────────────────▶ Trustless│
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Provider Deep Dive

#### **Turnkey** (Most Relevant for AI Agents)

```
┌─────────────────────────────────────────────────────────────────┐
│                      TURNKEY ARCHITECTURE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐                                               │
│   │  AI Agent   │                                               │
│   │  (No Keys)  │                                               │
│   └──────┬──────┘                                               │
│          │ API Call (signed with API key)                       │
│          ▼                                                      │
│   ┌─────────────────────────────────────────┐                   │
│   │           TURNKEY INFRASTRUCTURE        │                   │
│   │                                         │                   │
│   │  ┌────────────────────────────────────┐ │                   │
│   │  │         Policy Engine              │ │                   │
│   │  │  • Spending limits                 │ │                   │
│   │  │  • Allowlisted addresses           │ │                   │
│   │  │  • Rate limits                     │ │                   │
│   │  │  • Time-based rules                │ │                   │
│   │  └────────────────┬───────────────────┘ │                   │
│   │                   │                     │                   │
│   │                   ▼                     │                   │
│   │  ┌────────────────────────────────────┐ │                   │
│   │  │    Secure Enclave (AWS Nitro)      │ │                   │
│   │  │                                    │ │                   │
│   │  │    Private Key (never exported)    │ │                   │
│   │  │                                    │ │                   │
│   │  └────────────────────────────────────┘ │                   │
│   │                                         │                   │
│   └─────────────────────────────────────────┘                   │
│                                                                 │
│   Key Properties:                                               │
│   • Key generated in enclave, never leaves                      │
│   • API keys can be scoped (not full access)                    │
│   • Policies evaluated before signing                           │
│   • Audit log of all operations                                 │
│   • Sub-organizations for multi-tenant                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Marcus**: "Turnkey is interesting because the key is in a secure enclave (AWS Nitro), but you can call it programmatically via API. The policy engine evaluates BEFORE signing."

**David**: "So the agent has an API key to Turnkey, not the wallet private key. If the API key leaks, the attacker is still bound by the policies."

**Sarah**: "And policies can include: max $X per transaction, only these contract addresses, only these function selectors."

| Turnkey Feature | Benefit for AI Agents |
|-----------------|----------------------|
| API-based signing | Agent can sign without user presence |
| Policy engine | Enforce limits even if API key leaks |
| Secure enclave | Key never extractable |
| Sub-organizations | Multi-agent isolation |
| Audit logs | Forensics after incident |
| Passkey for admin | Human retains ultimate control |

**Pricing**: Pay-per-signature model, ~$0.05-0.10 per signature at scale

---

#### **Privy**

```
┌─────────────────────────────────────────────────────────────────┐
│                       PRIVY ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   User Authentication                                           │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│   │  Email  │  │ Social  │  │ Passkey │  │  Wallet │            │
│   └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘            │
│        └────────────┴────────────┴────────────┘                 │
│                          │                                      │
│                          ▼                                      │
│   ┌─────────────────────────────────────────┐                   │
│   │              PRIVY SERVER               │                   │
│   │                                         │                   │
│   │  Key Shard 1 (Privy) ◄─────────────-─┐  │                   │
│   │                                      │  │                   │
│   │  Key Shard 2 (User device/recovery)──┘  │                   │
│   │                                         │                   │
│   │  MPC signing when both shards present   │                   │
│   │                                         │                   │
│   └─────────────────────────────────────────┘                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**For AI Agents**: Privy is more focused on human users. Their "server wallets" feature could work for agents, but policy enforcement is less mature than Turnkey.

---

#### **Dynamic**

Similar to Privy - focused on human authentication UX. Has embedded wallets but less suited for autonomous agent use cases.

---

#### **Lit Protocol** (Decentralized Option)

```
┌─────────────────────────────────────────────────────────────────┐
│                    LIT PROTOCOL ARCHITECTURE                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌─────────────┐                                               │
│   │  AI Agent   │                                               │
│   └──────┬──────┘                                               │
│          │                                                      │
│          ▼                                                      │
│   ┌──────────────────────-───────────────────┐                  │
│   │         LIT NETWORK (Decentralized)      │                  │
│   │                                          │                  │
│   │   Node 1    Node 2    Node 3    Node N   │                  │
│   │   ┌────┐    ┌────┐    ┌────┐    ┌────┐   │                  │
│   │   │Shard│   │Shard│   │Shard│   │Shard│  │                  │
│   │   └──┬─┘    └──┬─┘    └──┬─┘    └──┬─┘   │                  │
│   │      └────────┴────────┴───────────┘     │                  │
│   │                   │                      │                  │
│   │                   ▼                      │                  │
│   │        Threshold Signature (t-of-n)      │                  │
│   │                                          │                  │
│   │   Access Control Conditions:             │                  │
│   │   • Token gating                         │                  │
│   │   • On-chain state checks                │                  │
│   │   • Custom boolean logic                 │                  │
│   │                                          │                  │
│   └-─────────────────────────────────────────┘                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Marcus**: "Lit is decentralized - no single party can sign. But 'access control conditions' are less flexible than Turnkey's policy engine."

**David**: "And there's latency. Every signature requires network consensus."

---

### Embedded Wallet Comparison for AI Agents

| Provider | Autonomous Signing | Policy Engine | Key Security | Decentralized | Pricing |
|----------|-------------------|---------------|--------------|---------------|---------|
| **Turnkey** | ✅ Full | ✅ Rich | ✅ Enclave | ❌ No | $$ |
| **Privy** | ⚠️ Limited | ⚠️ Basic | ✅ MPC | ❌ No | $$ |
| **Dynamic** | ⚠️ Limited | ⚠️ Basic | ✅ MPC | ❌ No | $$ |
| **Lit Protocol** | ✅ Full | ⚠️ On-chain only | ✅ Threshold | ✅ Yes | $ |
| **Fireblocks** | ✅ Full | ✅ Rich | ✅ MPC+Enclave | ❌ No | $$$$ |
| **Circle** | ✅ Full | ⚠️ Basic | ⚠️ Custodial | ❌ No | $$ |

---

## Council Revised Recommendations

### For AI Agents: Best Options

**Tier 1 (Recommended)**:
1. **Turnkey** - Best balance of security, flexibility, and developer experience
2. **Turnkey + Passkey** - Human uses passkey for admin, agent uses API

**Tier 2 (Viable)**:
3. **Safe + Session Keys** - If you want fully on-chain enforcement
4. **Lit Protocol** - If decentralization is a hard requirement

**Tier 3 (Consider)**:
5. **Coinbase Smart Wallet** - Great UX but less policy flexibility
6. **Fireblocks** - Enterprise-grade but expensive

### Architecture Decision Tree

```
Do you need full autonomy (no human per-tx)?
│
├── YES ──▶ Use Turnkey or Lit Protocol
│           │
│           └── Need decentralization? 
│               ├── YES ──▶ Lit Protocol
│               └── NO ───▶ Turnkey (recommended)
│
└── NO ───▶ Human approves some/all transactions
            │
            └── Use Passkey + Session Keys
                │
                └── On which wallet?
                    ├── Want simplicity ──▶ Coinbase Smart Wallet
                    └── Want control ────▶ Safe + ZeroDev
```

---

## Updated Questions for User

Given this deeper analysis:

### Q3 Revised: Key Infrastructure

| Option | Solution | Autonomy | Security | Cost |
|--------|----------|----------|----------|------|
| **A** | Turnkey (cloud enclave + policy engine) | Full | Very High | $$ |
| **B** | Privy/Dynamic (MPC embedded) | Limited | High | $$ |
| **C** | Lit Protocol (decentralized threshold) | Full | High | $ |
| **D** | Safe + Session Keys (on-chain) | Full (within policy) | Very High | Gas |
| **E** | Self-hosted HSM | Full | Very High | $$$ |
| **F** | Fireblocks (enterprise MPC) | Full | Very High | $$$$ |

**Council now recommends**: **A (Turnkey)** for most cases, **D (Safe + Session Keys)** if on-chain enforcement is critical

### Q5 Revised: Human Approval UX

| Option | Method | Works With |
|--------|--------|------------|
| **A** | Passkey for admin control, agent autonomous below threshold | Turnkey, Safe |
| **B** | Passkey required for every high-value tx | Coinbase Smart Wallet |
| **C** | Hardware wallet for admin, agent autonomous | Turnkey, Safe |
| **D** | Mobile app approval | Any |

**Council now recommends**: **A** - Passkey as root of trust, session key for agent

---

## Summary: Passkeys vs Embedded Wallets

| Aspect | Passkeys Alone | Embedded Wallet Alone | Passkey + Embedded (Hybrid) |
|--------|----------------|-----------------------|-----------------------------|
| Full autonomy | ❌ No | ✅ Yes | ✅ Yes |
| Human oversight | ✅ Built-in | ⚠️ Optional | ✅ Best of both |
| Key never extractable | ✅ Yes | ⚠️ Depends | ✅ Yes |
| On-chain enforcement | ❌ No | ⚠️ Depends | ✅ With Safe/4337 |
| Revocation | ⚠️ Complex | ✅ API-level | ✅ Both levels |
| Agent compromise impact | N/A (can't use) | Policy-limited | Policy-limited |

**David**: "The hybrid is clearly the winner. Passkey gives you the root of trust, embedded wallet (Turnkey) gives you the autonomous signing capability, and on-chain enforcement (Safe/4337) gives you the unforgeable limits."

**Marcus**: "Agreed. The question is whether users will accept that complexity."

**Sarah**: "If we abstract it properly, they won't see the complexity. They'll see: 'Set up your wallet (passkey), configure your agent's limits, done.'"
