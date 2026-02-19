import { Hono } from "hono";

import { SAFE_PRESET, NORMAL_PRESET, DEGEN_PRESET } from "../policy/presets.js";
import type { AppContext } from "./context.js";

const PRESETS = {
  safe: {
    name: "safe",
    description: "Conservative limits. Allowlist-only contracts. No bridging. No memecoins.",
    ...SAFE_PRESET,
  },
  normal: {
    name: "normal",
    description: "Moderate limits. Verified contracts. Canonical bridges only. Capped memecoins.",
    ...NORMAL_PRESET,
  },
  degen: {
    name: "degen",
    description: "Permissive limits. Blocklist-only filtering. All bridges. All memecoins.",
    ...DEGEN_PRESET,
  },
} as const;

export function createOpenRoutes(ctx: AppContext) {
  const app = new Hono();

  app.get("/chains", (c) => {
    const chains = ctx.chainRegistry.list().map((chain) => ({
      chainId: chain.chainId,
      type: chain.chainType,
      displayName: chain.displayName,
      nativeToken: chain.nativeToken,
    }));

    return c.json({ chains });
  });

  app.get("/policies/presets", (c) => {
    return c.json({
      presets: Object.values(PRESETS).map((p) => ({
        name: p.name,
        description: p.description,
        spending: p.spending,
        rateLimits: p.rateLimits,
        approval: p.approval,
        contracts: { mode: p.contracts.mode, tokenApprovalMode: p.contracts.tokenApprovalMode },
        bridging: { mode: p.bridging.mode },
        memecoins: { mode: p.memecoins.mode },
      })),
    });
  });

  app.get("/policies/presets/:name", (c) => {
    const name = c.req.param("name") as keyof typeof PRESETS;
    const preset = PRESETS[name];

    if (!preset) {
      return c.json({ error: `Unknown preset: ${name}. Valid presets: safe, normal, degen` }, 404);
    }

    return c.json(preset);
  });

  return app;
}
