import type { JWTService } from "../auth/jwt.js";
import type { PolicyEngine } from "../policy/engine.js";
import type { SigningProvider } from "../providers/interface.js";
import type { ChainRegistry } from "../chains/registry.js";
import type { DbSpendingTracker } from "../spending/tracker.js";

export interface AppContext {
  jwtService: JWTService;
  policyEngine: PolicyEngine;
  signingProvider: SigningProvider;
  chainRegistry: ChainRegistry;
  spendingTracker?: DbSpendingTracker;
}
