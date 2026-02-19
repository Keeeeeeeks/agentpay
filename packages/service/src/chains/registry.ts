import type { ChainAdapter } from "./interface.js";
import { EvmChainAdapter } from "./evm.js";
import { SolanaChainAdapter } from "./solana.js";
import { StellarChainAdapter } from "./stellar.js";

export interface ChainRegistryConfig {
  evmRpcUrls?: Record<string, string>;
  solanaRpcUrl?: string;
  stellarHorizonUrl?: string;
  stellarSorobanRpcUrl?: string;
}

const DEFAULT_EVM_CHAINS = [
  "eip155:1",
  "eip155:8453",
  "eip155:42161",
  "eip155:10",
  "eip155:137",
];

const DEFAULT_SOLANA_CHAINS = ["solana-mainnet", "solana-devnet"];

const DEFAULT_STELLAR_CHAINS = ["stellar-mainnet", "stellar-testnet"];

export class ChainRegistry {
  private adapters = new Map<string, ChainAdapter>();

  constructor(config: ChainRegistryConfig = {}) {
    // Register EVM chains
    for (const chainId of DEFAULT_EVM_CHAINS) {
      const rpcUrl = config.evmRpcUrls?.[chainId];
      try {
        this.adapters.set(chainId, new EvmChainAdapter({ chainId, rpcUrl }));
      } catch {
        // Chain not supported by viem — skip
      }
    }

    // Register Solana chains
    for (const chainId of DEFAULT_SOLANA_CHAINS) {
      this.adapters.set(
        chainId,
        new SolanaChainAdapter({ chainId, rpcUrl: config.solanaRpcUrl }),
      );
    }

    // Register Stellar chains
    for (const chainId of DEFAULT_STELLAR_CHAINS) {
      try {
        this.adapters.set(
          chainId,
          new StellarChainAdapter({
            chainId,
            horizonUrl: config.stellarHorizonUrl,
            sorobanRpcUrl: config.stellarSorobanRpcUrl,
          }),
        );
      } catch {
        // Chain not supported — skip
      }
    }
  }

  get(chainId: string): ChainAdapter | undefined {
    return this.adapters.get(chainId);
  }

  getOrThrow(chainId: string): ChainAdapter {
    const adapter = this.adapters.get(chainId);
    if (!adapter) {
      throw new Error(`Chain ${chainId} is not registered`);
    }
    return adapter;
  }

  list(): ChainAdapter[] {
    return Array.from(this.adapters.values());
  }

  listChainIds(): string[] {
    return Array.from(this.adapters.keys());
  }

  register(chainId: string, adapter: ChainAdapter): void {
    this.adapters.set(chainId, adapter);
  }
}
