import { eq, and, gte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { spendingTracking } from "../db/schema.js";
import type { SpendingTracker } from "../policy/engine.js";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function weekAgoStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}

function hourAgo(): Date {
  return new Date(Date.now() - 3_600_000);
}

export class DbSpendingTracker implements SpendingTracker {
  constructor(private readonly db: PostgresJsDatabase<Record<string, unknown>>) {}

  async getDailySpendUsd(agentId: string, chainId: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${spendingTracking.totalUsd}), '0')` })
      .from(spendingTracking)
      .where(
        and(
          eq(spendingTracking.agentId, agentId),
          eq(spendingTracking.chainId, chainId),
          eq(spendingTracking.date, todayStr()),
        ),
      );

    return Number(rows[0]?.total ?? "0");
  }

  async getWeeklySpendUsd(agentId: string, chainId: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${spendingTracking.totalUsd}), '0')` })
      .from(spendingTracking)
      .where(
        and(
          eq(spendingTracking.agentId, agentId),
          eq(spendingTracking.chainId, chainId),
          gte(spendingTracking.date, weekAgoStr()),
        ),
      );

    return Number(rows[0]?.total ?? "0");
  }

  async getHourlyTransactionCount(agentId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<string>`COALESCE(SUM(${spendingTracking.transactionCount}), '0')` })
      .from(spendingTracking)
      .where(
        and(
          eq(spendingTracking.agentId, agentId),
          eq(spendingTracking.date, todayStr()),
        ),
      );

    const totalToday = Number(rows[0]?.count ?? "0");
    return Math.min(totalToday, await this.estimateHourlyCount(agentId));
  }

  async getDailyTransactionCount(agentId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<string>`COALESCE(SUM(${spendingTracking.transactionCount}), '0')` })
      .from(spendingTracking)
      .where(
        and(
          eq(spendingTracking.agentId, agentId),
          eq(spendingTracking.date, todayStr()),
        ),
      );

    return Number(rows[0]?.count ?? "0");
  }

  async getMemecoinDailySpendUsd(agentId: string): Promise<number> {
    const rows = await this.db
      .select({ total: sql<string>`COALESCE(SUM(${spendingTracking.memecoinUsd}), '0')` })
      .from(spendingTracking)
      .where(
        and(
          eq(spendingTracking.agentId, agentId),
          eq(spendingTracking.date, todayStr()),
        ),
      );

    return Number(rows[0]?.total ?? "0");
  }

  async recordSpend(params: {
    agentId: string;
    chainId: string;
    amountUsd: number;
    isMemecoin: boolean;
    isBridge: boolean;
  }): Promise<void> {
    const today = todayStr();

    await this.db
      .insert(spendingTracking)
      .values({
        agentId: params.agentId,
        chainId: params.chainId,
        date: today,
        totalUsd: params.amountUsd.toFixed(8),
        memecoinUsd: params.isMemecoin ? params.amountUsd.toFixed(8) : "0",
        bridgeUsd: params.isBridge ? params.amountUsd.toFixed(8) : "0",
        transactionCount: 1,
      })
      .onConflictDoUpdate({
        target: [spendingTracking.agentId, spendingTracking.chainId, spendingTracking.date],
        set: {
          totalUsd: sql`${spendingTracking.totalUsd} + ${params.amountUsd.toFixed(8)}::decimal`,
          memecoinUsd: params.isMemecoin
            ? sql`${spendingTracking.memecoinUsd} + ${params.amountUsd.toFixed(8)}::decimal`
            : spendingTracking.memecoinUsd,
          bridgeUsd: params.isBridge
            ? sql`${spendingTracking.bridgeUsd} + ${params.amountUsd.toFixed(8)}::decimal`
            : spendingTracking.bridgeUsd,
          transactionCount: sql`${spendingTracking.transactionCount} + 1`,
        },
      });
  }

  private async estimateHourlyCount(agentId: string): Promise<number> {
    const rows = await this.db
      .select({ count: sql<string>`COALESCE(SUM(${spendingTracking.transactionCount}), '0')` })
      .from(spendingTracking)
      .where(
        and(
          eq(spendingTracking.agentId, agentId),
          eq(spendingTracking.date, todayStr()),
        ),
      );

    return Number(rows[0]?.count ?? "0");
  }
}
