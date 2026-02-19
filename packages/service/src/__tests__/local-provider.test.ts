import { describe, it, expect, beforeEach } from "vitest";

import { LocalProvider } from "../providers/local.js";

describe("LocalProvider", () => {
  let provider: LocalProvider;

  beforeEach(async () => {
    provider = new LocalProvider();
    await provider.initialize({ environment: "sandbox" });
  });

  describe("initialize", () => {
    it("sets provider to healthy state", async () => {
      expect(await provider.healthCheck()).toBe(true);
    });

    it("throws if used before initialization", async () => {
      const uninit = new LocalProvider();
      await expect(uninit.createWallet("EVM", "test")).rejects.toThrow("not initialized");
    });
  });

  describe("createWallet", () => {
    it("creates EVM wallet with 0x-prefixed address", async () => {
      const wallet = await provider.createWallet("EVM", "agent-1");
      expect(wallet.address).toMatch(/^0x[0-9a-f]{40}$/);
      expect(wallet.type).toBe("EVM");
      expect(wallet.provider).toBe("local");
      expect(wallet.chainId).toBe("eip155:1");
    });

    it("creates Solana wallet with base58-like address", async () => {
      const wallet = await provider.createWallet("SOLANA", "agent-1");
      expect(wallet.address.length).toBe(44);
      expect(wallet.type).toBe("SOLANA");
      expect(wallet.chainId).toBe("solana-mainnet");
    });

    it("creates Stellar wallet with G-prefixed address", async () => {
      const wallet = await provider.createWallet("STELLAR", "agent-1");
      expect(wallet.address).toMatch(/^G/);
      expect(wallet.type).toBe("STELLAR");
      expect(wallet.chainId).toBe("stellar-mainnet");
    });

    it("generates deterministic addresses for same identifier", async () => {
      const w1 = await provider.createWallet("EVM", "agent-x");
      const p2 = new LocalProvider();
      await p2.initialize({ environment: "sandbox" });
      const w2 = await p2.createWallet("EVM", "agent-x");
      expect(w1.address).toBe(w2.address);
    });
  });

  describe("listWallets", () => {
    it("returns empty array initially", async () => {
      const wallets = await provider.listWallets();
      expect(wallets).toEqual([]);
    });

    it("returns created wallets", async () => {
      await provider.createWallet("EVM", "a1");
      await provider.createWallet("SOLANA", "a2");
      const wallets = await provider.listWallets();
      expect(wallets).toHaveLength(2);
    });
  });

  describe("getAddress", () => {
    it("returns address for matching chain type", async () => {
      const wallet = await provider.createWallet("EVM", "agent-1");
      const addr = await provider.getAddress("eip155:1");
      expect(addr).toBe(wallet.address);
    });

    it("throws if no wallet for chain type", async () => {
      await provider.createWallet("EVM", "agent-1");
      await expect(provider.getAddress("solana-mainnet")).rejects.toThrow();
    });
  });

  describe("signTransaction", () => {
    it("returns hash and signedTransaction", async () => {
      await provider.createWallet("EVM", "agent-1");
      const result = await provider.signTransaction({
        chainId: "eip155:1",
        to: "0x0000000000000000000000000000000000000001",
        value: "1000000000000000000",
      });

      expect(result.hash).toMatch(/^0x[0-9a-fA-F]+$/);
      expect(result.signedTransaction).toMatch(/^0x[0-9a-fA-F]+$/);
    });
  });

  describe("signMessage", () => {
    it("returns a hex signature", async () => {
      await provider.createWallet("EVM", "agent-1");
      const sig = await provider.signMessage("hello", "eip155:1");
      expect(sig).toMatch(/^0x[0-9a-fA-F]+$/);
    });
  });
});
