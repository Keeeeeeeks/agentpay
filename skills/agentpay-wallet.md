# AgentPay Wallet Skill

You have access to an AgentPay wallet service. Use it to transact on-chain.

## Authentication

Every request requires your JWT in the `Authorization: Bearer <token>` header. The token is scoped to specific chains and policy limits. Check `AGENTPAY_TOKEN` env var.

## Core operations

### Check your balances

```
GET /api/balances/me
GET /api/balances/me/:chainId
```

Always check balance before transacting. Insufficient funds = failed tx + wasted gas.

### Check your policy limits

```
GET /api/policy/me
GET /api/policy/me/remaining
```

Returns your per-tx max, daily/weekly remaining budget, rate limits, and contract allowlist. Check `remaining` before submitting transactions to avoid rejections.

### Sign a transaction

```
POST /api/transactions/sign
{
  "chainId": "eip155:8453",
  "to": "0x...",
  "value": "1000000",
  "data": "0x...",
  "reason": "Brief explanation of why"
}
```

The `reason` field is logged in the audit trail. Be specific: "Swap 50 USDC to ETH on Uniswap" not "trading".

**Response statuses**:
- `approved` — signed and broadcast. You get `transactionHash`.
- `pending_human` — above your autonomous threshold. Human must approve. You get `approvalUrl`. Poll `GET /api/transactions/:id` to check.
- `rejected` — policy blocked it. Read `rejectionReason` to understand why.

### Invoke a Soroban contract

```
POST /api/transactions/soroban/invoke
{
  "chainId": "stellar-mainnet",
  "contractId": "CCONTRACT...",
  "method": "transfer",
  "args": [],
  "reason": "Transfer tokens via Soroban SAC"
}
```

### Check transaction status

```
GET /api/transactions/:id
```

Use this to poll for human approval or chain confirmation.

## Chain IDs

| Chain | ID |
|-------|----|
| Stellar | `stellar-mainnet`, `stellar-testnet` |
| Base | `eip155:8453` |
| Ethereum | `eip155:1` |
| Arbitrum | `eip155:42161` |
| Solana | `solana-mainnet` |

## Value encoding

- **EVM**: Wei (18 decimals). 1 ETH = `1000000000000000000`. USDC = 6 decimals.
- **Stellar**: Stroops (7 decimals). 1 XLM = `10000000`.
- **Solana**: Lamports (9 decimals). 1 SOL = `1000000000`.

## Common patterns

### Transfer native token

```json
{
  "chainId": "eip155:8453",
  "to": "0xRecipient",
  "value": "50000000000000000",
  "reason": "Send 0.05 ETH on Base"
}
```

### ERC-20 transfer (e.g. USDC on Base)

```json
{
  "chainId": "eip155:8453",
  "to": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "value": "0",
  "data": "0xa9059cbb000000000000000000000000RECIPIENT_PADDED0000000000000000000000000000000000000000000000000000AMOUNT_HEX",
  "reason": "Transfer 100 USDC to 0xRecipient"
}
```

### XLM transfer

```json
{
  "chainId": "stellar-mainnet",
  "to": "GDESTINATION...",
  "value": "100000000",
  "reason": "Send 10 XLM"
}
```

## Error handling

- If you get `rejected` with "Contract not in allowlist", you can request allowlist addition via `POST /api/allowlist/request` with `{ contractAddress, chainId, reason }`.
- If you get `rejected` with "Daily limit exceeded", stop transacting and inform the user.
- If you get `pending_human`, tell the user a transaction is waiting for their approval and provide the approval URL.

## Rules

1. Always check `remaining` budget before submitting
2. Always provide a clear `reason`
3. Never retry a rejected transaction without changing the parameters
4. If a transaction is `pending_human`, wait — don't resubmit
5. Verify recipient addresses carefully — blockchain transactions are irreversible
