export interface AgentTokenPayload {
  sub: string;
  iss: "agentpay";
  iat: number;
  exp: number;
  jti: string;

  ap: {
    wallet_id: string;
    chains: string[];
    policy_id: string;
    preset: import("../policy/types.js").PolicyPreset;
    parent_token_id?: string;
    delegation_depth?: number;
  };
}

export interface TokenIssueRequest {
  agentId: string;
  walletId: string;
  chains: string[];
  policyId: string;
  preset: import("../policy/types.js").PolicyPreset;
  expiresInSeconds?: number;
}

export interface RefreshTokenResult {
  refreshToken: string;
  expiresAt: Date;
  familyId: string;
}

export interface TokenPairResult {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  refreshExpiresAt: Date;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: AgentTokenPayload;
  error?: string;
}
