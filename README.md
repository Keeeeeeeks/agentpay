# AgentPay

Cloud wallet infrastructure for AI agents. Agents transact on-chain without ever touching private keys.

AgentPay sits between your AI agent and the blockchain. You set spending policies, issue scoped tokens, and your agent autonomously executes transactions within those bounds. If something exceeds policy, it queues for human approval. Every action is audit-logged.

## Architecture

```
Human (CLI)                          Agent (SDK/HTTP)
    |                                     |
    | session token                       | JWT (scoped, 24h)
    v                                     v
+--------------------------------------------------------+
|                  AgentPay Service                      |
|                                                        |
|  Auth --> Policy Engine --> Signing Provider --> Chain |
|                                                        |
|  11-check policy pipeline:                             |
|   token valid -> chain allowed -> blocklist ->         |
|   contract mode -> function selector -> bridge ->      |
|   memecoin -> value limit -> daily cap ->              |
|   rate limit -> approval threshold                     |
+--------------------------------------------------------+
         |              |              |
    +----+         +----+         +----+
    v              v              v
  EVM          Solana         Stellar
(Eth, Base,   (Mainnet,     (Mainnet,
 Arb, OP,      Devnet)       Testnet,
 Polygon)                    Soroban)
```

## Quick Start

### 1. Install and Login

```bash
npx @agentpay/cli login
# Enter your service endpoint and admin key
```

### 2. Create an Agent

```bash
agentpay agent create --name "trader" --preset safe
# -> Agent ID: agent_abc123
# -> Wallet: 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18
# -> Policy: safe (max $25/tx, $100/day, allowlist-only)
```

### 3. Issue a Token

```bash
agentpay token create agent_abc123 --export .env
# -> AGENTPAY_TOKEN=eyJhbGciOiJSUzI1NiIs... written to .env
```

### 4. Use from Your Agent

```typescript
import { AgentPayClient } from "@agentpay/sdk";

const client = new AgentPayClient({
  baseUrl: process.env.AGENTPAY_URL!,
  token: process.env.AGENTPAY_TOKEN!,
});

const remaining = await client.getPolicyRemaining();
console.log(`$${remaining.dailyRemainingUsd} remaining today`);

const check = await client.canTransact({
  chainId: "eip155:8453",
  to: "0x...",
  value: "1000000",
});

if (check.canTransact) {
  const result = await client.signTransaction({
    chainId: "eip155:8453",
    to: "0x...",
    value: "1000000",
    reason: "Swap USDC for ETH on Uniswap",
  });

  if (result.status === "approved") {
    console.log(`TX: ${result.transactionHash}`);
  } else if (result.status === "pending_human") {
    console.log(`Queued for approval: ${result.approvalUrl}`);
  }
}
```

## Policy Presets

| | Safe | Normal | Degen |
|---|---|---|---|
| Max per-tx | $25 | $250 | $10,000 |
| Daily limit | $100 | $2,500 | $50,000 |
| Weekly limit | $500 | $10,000 | $250,000 |
| Tx/hour | 5 | 20 | 100 |
| Tx/day | 20 | 100 | 500 |
| Autonomous threshold | $25 | $250 | $10,000 |
| Contract mode | allowlist | verified | blocklist-only |
| Token approvals | exact | capped (2x) | uncapped |
| Bridging | disabled | stables + canonical | any |
| Memecoins | disabled | capped ($50/tx, $200/day) | allowed |

```bash
agentpay policy presets                    # View all presets
agentpay policy set agent_abc123 --preset normal
agentpay policy set agent_abc123 --daily-limit 500 --max-tx 50 --bridge-mode stables_canonical
```

## CLI Reference

```bash
# Auth
agentpay login                            # Authenticate with service
agentpay logout                           # Clear session
agentpay whoami                           # Show current session

# Agents
agentpay agent create --name <name> [--preset safe|normal|degen] [--chains eth,base,sol]
agentpay agent list
agentpay agent info <id>
agentpay agent revoke <id>

# Tokens
agentpay token create <agent-id> [--ttl 86400] [--export .env]
agentpay token list <agent-id>
agentpay token revoke <agent-id> <jti>

# Policy
agentpay policy show <agent-id>
agentpay policy set <agent-id> [--preset <preset>] [--daily-limit <usd>] [--max-tx <usd>]
agentpay policy presets

# Approvals
agentpay approvals list
agentpay approvals approve <id>
agentpay approvals reject <id> [--reason <text>]

# Audit
agentpay audit <agent-id> [--limit 50]

# Service
agentpay health
```

## API Reference

### Agent Endpoints (JWT auth)

| Method | Path | Description |
|---|---|---|
| GET | /api/wallets/me | Wallet info + addresses per chain |
| GET | /api/balances | All chain balances |
| GET | /api/balances/:chainId | Single chain balance |
| POST | /api/transactions/sign | Submit transaction for signing |
| GET | /api/transactions/status/:hash | Transaction status |
| GET | /api/policy/me | Current policy limits |
| GET | /api/policy/me/remaining | Remaining daily/weekly budget |
| GET | /api/policy/me/can-transact | Pre-check transaction viability |
| POST | /api/allowlist/request | Request contract allowlist addition |

### Admin Endpoints (session auth)

| Method | Path | Description |
|---|---|---|
| POST | /api/agents | Create agent + wallet + policy |
| GET | /api/agents | List agents |
| GET | /api/agents/:id | Agent details |
| PATCH | /api/agents/:id/disable | Disable agent |
| DELETE | /api/agents/:id | Delete agent + revoke all tokens |
| POST | /api/agents/:id/tokens | Issue JWT |
| GET | /api/agents/:id/tokens | List tokens |
| DELETE | /api/agents/:id/tokens/:jti | Revoke token |
| GET | /api/agents/:id/policy | Get policy |
| PUT | /api/agents/:id/policy | Update policy |
| GET | /api/agents/:id/policy/history | Policy version history |
| GET | /api/agents/:id/policy/remaining | Remaining budget |
| GET | /api/approvals | Pending approvals |
| GET | /api/approvals/:id | Approval details |
| POST | /api/approvals/:id/approve | Approve |
| POST | /api/approvals/:id/reject | Reject |
| GET | /api/audit/:agentId | Audit logs |

### Open Endpoints

| Method | Path | Description |
|---|---|---|
| GET | /health | Service health + provider status |
| GET | /api/chains | Supported chains |
| GET | /api/policies/presets | Available presets |
| GET | /api/policies/presets/:name | Preset details |

## Chains

| Chain | ID | Type | Signing |
|---|---|---|---|
| Ethereum | eip155:1 | EVM | Para MPC |
| Base | eip155:8453 | EVM | Para MPC |
| Arbitrum | eip155:42161 | EVM | Para MPC |
| Optimism | eip155:10 | EVM | Para MPC |
| Polygon | eip155:137 | EVM | Para MPC |
| Solana | solana-mainnet | Solana | Para MPC |
| Stellar | stellar-mainnet | Stellar | ed25519 (encrypted) |
| Stellar Testnet | stellar-testnet | Stellar | ed25519 (encrypted) |

## Project Structure

```
ai-wallet/
  packages/
    service/          Core service (Hono, Drizzle, TypeScript)
      src/
        api/          REST routes
        auth/         JWT + admin auth middleware
        policy/       11-check policy engine + presets
        providers/    Signing adapters (Local, Para, Stellar)
        chains/       Chain adapters (EVM, Solana, Stellar + Soroban)
        db/           Drizzle schema (12 tables)
        audit/        Audit logging
    sdk/              Agent-facing TypeScript SDK (@agentpay/sdk)
      src/
        client.ts     AgentPayClient (typed, zod-validated)
        types.ts      Request/response types + schemas
    cli/              Human-facing CLI (@agentpay/cli)
      src/
        commands/     login, agent, token, policy, approvals, audit, health
  AGENTPAY-SPEC.md    Full specification
```

## Development

```bash
pnpm install

# Start the service (dev mode, local signing provider)
cp packages/service/.env.example packages/service/.env
pnpm --filter @agentpay/service dev

# Run tests (includes adversarial e2e suite)
pnpm --filter @agentpay/service test

# Type check all packages
pnpm --filter @agentpay/service typecheck
pnpm --filter @agentpay/sdk typecheck

# Build SDK
pnpm --filter @agentpay/sdk build
```

### Environment Variables

```bash
DATABASE_URL=postgres://agentpay:agentpay@localhost:5433/agentpay
AGENTPAY_ADMIN_KEY=your-admin-secret
PORT=3456
SIGNING_PROVIDER=local          # local | para
PARA_API_KEY=                   # Required when SIGNING_PROVIDER=para
PARA_ENVIRONMENT=sandbox        # sandbox | production
STELLAR_HORIZON_URL=            # Optional, uses public default
STELLAR_SOROBAN_RPC_URL=        # Optional, uses public default
```

## Security Model

**Agent isolation**: Each agent gets its own wallet, policy, and token scope. Agent A cannot access Agent B's wallet or exceed its own policy limits.

**Policy enforcement**: 11-check pipeline on every transaction. Policies are versioned with full audit trail. Tightening is instant; loosening requires re-authentication.

**Token lifecycle**: JWTs scoped to specific chains and policies, 24h expiry, instant revocation via blocklist checked on every request.

**Signing security**: Private keys never leave the signing provider. Para uses MPC (neither party has the full key). Stellar keys encrypted at rest.

**Adversarial testing**: The test suite assumes stolen tokens, policy escalation attempts, cross-agent isolation breaches, input injection, rate limit evasion, and admin impersonation.

## Architecture

See [AGENTPAY-SPEC.md](./AGENTPAY-SPEC.md) for the full specification.

## License

MIT