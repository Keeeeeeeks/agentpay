import { eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { knownBridges, knownMemecoins } from "../db/schema.js";
import type { AssetClassifier } from "../policy/engine.js";
import type { AgentPolicy } from "../policy/types.js";

export class DbAssetClassifier implements AssetClassifier {
  constructor(private readonly db: PostgresJsDatabase<Record<string, unknown>>) {}

  async isBridgeContract(address: string, chainId: string): Promise<boolean> {
    const normalized = address.toLowerCase();

    const rows = await this.db
      .select({ address: knownBridges.address })
      .from(knownBridges)
      .where(eq(knownBridges.chainId, chainId));

    return rows.some((row) => row.address.toLowerCase() === normalized);
  }

  async isMemecoin(
    address: string,
    chainId: string,
    _criteria: AgentPolicy["memecoins"]["detectionCriteria"],
  ): Promise<boolean> {
    const normalized = address.toLowerCase();

    const rows = await this.db
      .select({ address: knownMemecoins.address })
      .from(knownMemecoins)
      .where(eq(knownMemecoins.chainId, chainId));

    return rows.some((row) => row.address.toLowerCase() === normalized);
  }
}
