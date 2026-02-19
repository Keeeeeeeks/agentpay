import type { Context, Next, MiddlewareHandler } from "hono";

import type { JWTService } from "./jwt.js";
import type { AgentTokenPayload } from "./types.js";

export interface AgentAuthEnv {
  Variables: {
    agentToken: AgentTokenPayload;
  };
}

export interface PasskeyAuthEnv {
  Variables: {
    passkeyUserId: string;
  };
}

/** Sets c.get("agentToken") on success, returns 401 on failure. */
export function requireAgentAuth(jwtService: JWTService): MiddlewareHandler<AgentAuthEnv> {
  return async (c: Context<AgentAuthEnv>, next: Next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Missing or invalid Authorization header" }, 401);
    }

    const token = authHeader.slice(7);
    const result = await jwtService.validateToken(token);

    if (!result.valid || !result.payload) {
      return c.json({ error: result.error ?? "Invalid token" }, 401);
    }

    c.set("agentToken", result.payload);
    await next();
  };
}

/** MVP: admin key auth. Production: WebAuthn passkey assertion via @simplewebauthn/server. */
export function requirePasskeyAuth(): MiddlewareHandler<PasskeyAuthEnv> {
  return async (c: Context<PasskeyAuthEnv>, next: Next) => {
    const adminKey = c.req.header("X-Admin-Key");
    const expectedKey = process.env["AGENTPAY_ADMIN_KEY"];

    if (!expectedKey) {
      return c.json({ error: "Admin authentication not configured" }, 500);
    }

    if (!adminKey || adminKey !== expectedKey) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("passkeyUserId", "admin");
    await next();
  };
}
