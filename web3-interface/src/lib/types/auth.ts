export interface Web3AuthState {
  token: string | null;
  address: string | null;
  chainId: string | null;
  userId: string | null;
}

export interface NonceResponse {
  nonce: string;
  domain: string;
  statement: string;
  uri: string;
}

export interface LoginRequest {
  message: string;
  signature: string;
}

export interface LoginResponse {
  jwt: string;
  userId: string;
  address: string;
  chainId: string;
  expiresIn: number;
}

export interface SessionResponse {
  authenticated: boolean;
  address?: string;
  chainId?: string;
  userId?: string;
}