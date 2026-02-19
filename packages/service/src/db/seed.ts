import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { nanoid } from "nanoid";

import * as schema from "./schema.js";
import { createPolicyFromPreset } from "../policy/presets.js";

const connectionString =
  process.env["DATABASE_URL"] ?? "postgres://agentpay:agentpay@localhost:5433/agentpay";

const client = postgres(connectionString, { max: 1 });
const db = drizzle(client, { schema });

async function seed() {
  console.log("Seeding database...");

  // --- Seed agent with "safe" policy ---

  const agentId = nanoid();
  const walletId = nanoid();

  await db.insert(schema.agents).values({
    id: agentId,
    name: "demo-trader",
    status: "active",
    createdBy: "seed",
  });
  console.log(`  Agent: ${agentId} (demo-trader)`);

  await db.insert(schema.agentWallets).values({
    id: walletId,
    agentId,
    provider: "local",
    providerWalletId: `local-${nanoid(8)}`,
  });

  await db.insert(schema.walletAddresses).values([
    { walletId, chainId: "eip155:1", address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18" },
    { walletId, chainId: "eip155:8453", address: "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18" },
  ]);
  console.log(`  Wallet: ${walletId} (eip155:1, eip155:8453)`);

  const policy = createPolicyFromPreset(agentId, "safe", "seed");
  await db.insert(schema.agentPolicies).values({
    id: policy.id,
    agentId,
    version: 1,
    preset: "safe",
    data: policy,
    createdBy: "seed",
    changeSummary: "Initial seed policy",
  });
  console.log(`  Policy: safe preset`);

  // --- Seed known bridges ---

  const bridges = [
    { address: "0x5e4e65926ba27467555eb562121fac00d24e9dd2", chainId: "eip155:1", name: "Across V3", canonical: true },
    { address: "0x3154cf16ccdb4c6d922629664174b904d80f2c35", chainId: "eip155:1", name: "Base Bridge", canonical: true },
    { address: "0x99c9fc46f92e8a1c0dec1b1747d010903e884be1", chainId: "eip155:1", name: "Optimism Gateway", canonical: true },
    { address: "0xa0c68c638235ee32657e8f720a23cec1bfc6c4d", chainId: "eip155:1", name: "Polygon Bridge", canonical: true },
    { address: "0x8315177ab297ba92a06054ce80a67ed4dbd7ed3a", chainId: "eip155:1", name: "Arbitrum Bridge", canonical: true },
  ];

  for (const bridge of bridges) {
    await db.insert(schema.knownBridges).values(bridge);
  }
  console.log(`  Bridges: ${bridges.length} canonical bridges`);

  // --- Seed known memecoins ---

  const memecoins = [
    { address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933", chainId: "eip155:1", symbol: "PEPE", name: "Pepe", source: "seed" },
    { address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE", chainId: "eip155:1", symbol: "SHIB", name: "Shiba Inu", source: "seed" },
    { address: "0xb131f4A55907B10d1F0A50d8ab8FA09EC342cd74", chainId: "eip155:1", symbol: "MEME", name: "Memecoin", source: "seed" },
  ];

  for (const coin of memecoins) {
    await db.insert(schema.knownMemecoins).values(coin);
  }
  console.log(`  Memecoins: ${memecoins.length} known memecoins`);

  // --- Seed contract allowlist for demo agent ---

  await db.insert(schema.contractAllowlists).values([
    {
      agentId,
      address: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
      chainId: "eip155:1",
      name: "Uniswap V2 Router",
      type: "dex",
      allowedFunctions: [
        { selector: "0x38ed1739", name: "swapExactTokensForTokens" },
        { selector: "0x8803dbee", name: "swapTokensForExactTokens" },
        { selector: "0x7ff36ab5", name: "swapExactETHForTokens" },
      ],
      maxApprovalAmount: "1000000000000000000000",
      addedBy: "seed",
      notes: "Uniswap V2 router for demo agent",
    },
    {
      agentId,
      address: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
      chainId: "eip155:1",
      name: "Uniswap V3 Router",
      type: "dex",
      allowedFunctions: [
        { selector: "0x04e45aaf", name: "exactInputSingle" },
        { selector: "0xb858183f", name: "exactInput" },
      ],
      maxApprovalAmount: "1000000000000000000000",
      addedBy: "seed",
      notes: "Uniswap V3 swap router for demo agent",
    },
  ]);
  console.log(`  Allowlist: 2 contracts (Uniswap V2/V3 routers)`);

  console.log("\nSeed complete.");
  await client.end();
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
