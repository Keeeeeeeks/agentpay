import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";

import { JWTService, LocalJWTSigner, InMemoryTokenRevocationStore } from "./auth/jwt.js";
import { requireAgentAuth, requirePasskeyAuth } from "./auth/middleware.js";
import { PolicyEngine } from "./policy/engine.js";
import type { SpendingTracker, PriceOracle, AssetClassifier } from "./policy/engine.js";
import { LocalProvider } from "./providers/local.js";
import { ParaProvider } from "./providers/para.js";
import type { SigningProvider, ProviderConfig } from "./providers/interface.js";
import { ChainRegistry } from "./chains/registry.js";
import type { ChainRegistryConfig } from "./chains/registry.js";
import { db, userShares } from "./db/index.js";
import { eq } from "drizzle-orm";

import { createAgentRoutes } from "./api/agents.js";
import { createTokenRoutes } from "./api/tokens.js";
import { createTransactionRoutes } from "./api/transactions.js";
import { createBalanceRoutes } from "./api/balances.js";
import { createPolicyRoutes } from "./api/policies.js";
import { createApprovalRoutes } from "./api/approvals.js";
import { createAuditRoutes } from "./api/audit.js";
import { createAgentSelfRoutes } from "./api/agent-self.js";
import { createOpenRoutes } from "./api/open.js";
import type { AppContext } from "./api/context.js";

function env(key: string, fallback?: string): string {
  return process.env[key] ?? fallback ?? "";
}

const stubSpendingTracker: SpendingTracker = {
  getDailySpendUsd: async () => 0,
  getWeeklySpendUsd: async () => 0,
  getHourlyTransactionCount: async () => 0,
  getDailyTransactionCount: async () => 0,
  getMemecoinDailySpendUsd: async () => 0,
};

const stubPriceOracle: PriceOracle = {
  convertToUsd: async (value: string) => Number(value) || 0,
};

const stubAssetClassifier: AssetClassifier = {
  isBridgeContract: async () => false,
  isMemecoin: async () => false,
};

async function createSigningProvider(): Promise<SigningProvider> {
  const providerName = env("SIGNING_PROVIDER", "local");

  if (providerName === "para") {
    const apiKey = env("PARA_API_KEY");
    if (!apiKey) {
      throw new Error("PARA_API_KEY is required when SIGNING_PROVIDER=para");
    }

    const provider = new ParaProvider();

    provider.setUserShareStore({
      async get(walletId: string): Promise<string | null> {
        const [row] = await db
          .select()
          .from(userShares)
          .where(eq(userShares.walletId, walletId));
        return row?.encryptedShare ?? null;
      },
      async set(walletId: string, share: string): Promise<void> {
        await db
          .insert(userShares)
          .values({ walletId, encryptedShare: share, provider: "para" })
          .onConflictDoUpdate({
            target: userShares.walletId,
            set: { encryptedShare: share, updatedAt: new Date() },
          });
      },
    });

    const config: ProviderConfig = {
      apiKey,
      environment: env("PARA_ENVIRONMENT", "sandbox") as "production" | "sandbox",
    };

    await provider.initialize(config);
    console.log(`Signing provider: Para (${config.environment})`);
    return provider;
  }

  const provider = new LocalProvider();
  await provider.initialize({ environment: "sandbox" });
  console.log("Signing provider: Local (dev mode — fake signatures)");
  return provider;
}

function buildChainRegistryConfig(): ChainRegistryConfig {
  const evmRpcUrls: Record<string, string> = {};
  const rpcMappings: Record<string, string> = {
    RPC_EIP155_1: "eip155:1",
    RPC_EIP155_8453: "eip155:8453",
    RPC_EIP155_42161: "eip155:42161",
    RPC_EIP155_10: "eip155:10",
    RPC_EIP155_137: "eip155:137",
  };

  for (const [envKey, chainId] of Object.entries(rpcMappings)) {
    const url = env(envKey);
    if (url) {
      evmRpcUrls[chainId] = url;
    }
  }

  return {
    evmRpcUrls: Object.keys(evmRpcUrls).length > 0 ? evmRpcUrls : undefined,
    solanaRpcUrl: env("RPC_SOLANA_MAINNET") || undefined,
    stellarHorizonUrl: env("STELLAR_HORIZON_URL") || undefined,
    stellarSorobanRpcUrl: env("STELLAR_SOROBAN_RPC_URL") || undefined,
  };
}

async function main() {
  const signer = new LocalJWTSigner();
  const revocationStore = new InMemoryTokenRevocationStore();
  const jwtService = new JWTService(signer, revocationStore);

  const signingProvider = await createSigningProvider();
  const chainRegistry = new ChainRegistry(buildChainRegistryConfig());

  const policyEngine = new PolicyEngine(
    stubSpendingTracker,
    stubPriceOracle,
    revocationStore,
    stubAssetClassifier,
  );

  const appCtx: AppContext = {
    jwtService,
    policyEngine,
    signingProvider,
    chainRegistry,
  };

  const app = new Hono();

  app.use("*", cors());
  app.use("*", logger());

  app.get("/health", async (c) => {
    const providerHealthy = await signingProvider.healthCheck().catch(() => false);
    const chainIds = chainRegistry.listChainIds();

    return c.json({
      status: providerHealthy ? "ok" : "degraded",
      provider: {
        name: signingProvider.name,
        healthy: providerHealthy,
      },
      chains: chainIds,
      version: "0.1.0",
    });
  });

  const adminAuth = requirePasskeyAuth();
  const agentAuth = requireAgentAuth(jwtService);

  app.route("/api", createOpenRoutes(appCtx));

  app.route("/api/agents", (() => {
    const r = new Hono();
    r.use("*", adminAuth);
    r.route("/", createAgentRoutes(appCtx));
    return r;
  })());

  app.route("/api/agents", (() => {
    const r = new Hono();
    r.use("*", adminAuth);
    r.route("/", createTokenRoutes(appCtx));
    return r;
  })());

  app.route("/api/agents", (() => {
    const r = new Hono();
    r.use("*", adminAuth);
    r.route("/", createPolicyRoutes(appCtx));
    return r;
  })());

  app.route("/api", (() => {
    const r = new Hono();
    r.use("*", agentAuth);
    r.route("/", createAgentSelfRoutes(appCtx));
    return r;
  })());

  app.route("/api/transactions", (() => {
    const r = new Hono();
    r.use("*", agentAuth);
    r.route("/", createTransactionRoutes(appCtx));
    return r;
  })());

  app.route("/api/balances", (() => {
    const r = new Hono();
    r.use("*", agentAuth);
    r.route("/", createBalanceRoutes(appCtx));
    return r;
  })());

  app.route("/api/approvals", (() => {
    const r = new Hono();
    r.use("*", adminAuth);
    r.route("/", createApprovalRoutes(appCtx));
    return r;
  })());

  app.route("/api/audit", (() => {
    const r = new Hono();
    r.use("*", adminAuth);
    r.route("/", createAuditRoutes(appCtx));
    return r;
  })());

  const port = Number(process.env["PORT"] ?? 3000);
  console.log(`AgentPay service starting on port ${port}`);

  serve({ fetch: app.fetch, port });
}

main().catch((err) => {
  console.error("Failed to start AgentPay:", err);
  process.exit(1);
});
