import { Hono } from "hono";
import { eq } from "drizzle-orm";

import type { AgentAuthEnv } from "../auth/middleware.js";
import type { BalanceResponse } from "./types.js";
import { db, agentWallets, walletAddresses } from "../db/index.js";
import type { AppContext } from "./context.js";

export function createBalanceRoutes(ctx: AppContext) {
  const app = new Hono<AgentAuthEnv>();

  app.get("/", async (c) => {
    const agentToken = c.get("agentToken");

    const [wallet] = await db
      .select()
      .from(agentWallets)
      .where(eq(agentWallets.agentId, agentToken.sub));

    if (!wallet) {
      return c.json({ error: "No wallet found for agent" }, 404);
    }

    const addresses = await db
      .select()
      .from(walletAddresses)
      .where(eq(walletAddresses.walletId, wallet.id));

    const chains: BalanceResponse["chains"] = {};

    for (const chainId of agentToken.ap.chains) {
      const chain = ctx.chainRegistry.get(chainId);
      if (!chain) continue;

      const addrRow = addresses.find((a: { chainId: string }) => a.chainId === chainId);
      if (!addrRow) continue;

      try {
        const native = await chain.getBalance(addrRow.address);
        const tokens = await chain.getTokenBalances(addrRow.address);

        chains[chainId] = {
          chainId,
          displayName: chain.displayName,
          address: addrRow.address,
          native,
          tokens,
        };
      } catch {
        chains[chainId] = {
          chainId,
          displayName: chain.displayName,
          address: addrRow.address,
          native: { symbol: chain.nativeToken.symbol, name: chain.nativeToken.symbol, address: "native", balance: "0", decimals: chain.nativeToken.decimals },
          tokens: [],
        };
      }
    }

    const response: BalanceResponse = {
      agentId: agentToken.sub,
      walletId: wallet.id,
      chains,
    };

    return c.json(response);
  });

  app.get("/:chainId", async (c) => {
    const agentToken = c.get("agentToken");
    const chainId = c.req.param("chainId");

    if (!agentToken.ap.chains.includes(chainId)) {
      return c.json({ error: `Chain ${chainId} not authorized` }, 403);
    }

    const chain = ctx.chainRegistry.get(chainId);
    if (!chain) {
      return c.json({ error: `Chain ${chainId} not supported` }, 400);
    }

    const [wallet] = await db
      .select()
      .from(agentWallets)
      .where(eq(agentWallets.agentId, agentToken.sub));

    if (!wallet) {
      return c.json({ error: "No wallet found" }, 404);
    }

    const [addrRow] = await db
      .select()
      .from(walletAddresses)
      .where(eq(walletAddresses.walletId, wallet.id));

    if (!addrRow) {
      return c.json({ error: "No address for chain" }, 404);
    }

    const native = await chain.getBalance(addrRow.address);
    const tokens = await chain.getTokenBalances(addrRow.address);

    return c.json({
      chainId,
      displayName: chain.displayName,
      address: addrRow.address,
      native,
      tokens,
    });
  });

  return app;
}
