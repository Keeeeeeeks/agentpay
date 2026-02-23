import { Hono } from "hono";

import { RefreshTokenReuseError } from "../auth/jwt.js";
import type { RefreshRequest } from "../auth/types.js";
import type { AppContext } from "./context.js";

export function createRefreshRoutes(ctx: AppContext) {
  const app = new Hono();

  app.post("/refresh", async (c) => {
    const body = await c.req.json<RefreshRequest>();

    if (!body.refreshToken || typeof body.refreshToken !== "string") {
      return c.json({ error: "refreshToken is required" }, 400);
    }

    try {
      const refreshed = await ctx.jwtService.refreshAccessToken(body.refreshToken);
      return c.json({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        accessExpiresAt: refreshed.accessExpiresAt,
        refreshExpiresAt: refreshed.refreshExpiresAt,
      });
    } catch (error) {
      if (error instanceof RefreshTokenReuseError) {
        return c.json({ error: error.message }, 401);
      }

      if (error instanceof Error) {
        return c.json({ error: error.message }, 401);
      }

      return c.json({ error: "Refresh failed" }, 401);
    }
  });

  return app;
}
