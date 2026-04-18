export interface SuccessResponse {
  type: 'success';
  exchange: string;
  id: string;
  api_key: string;
  secret: string;
}

export interface ErrorResponse {
  type: 'error';
  error: string;
}

export interface AggregatedBalances {
  [exchange: string]: {
    free: Record<string, string>;
    used: Record<string, string>;
    total: Record<string, string>;
  };
}
