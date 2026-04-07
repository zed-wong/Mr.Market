export interface AdminPasswordResp {
  access_token: string
}

export interface AdminSpotOrder {
  type: string,
  userID: string,
  exchange: string,
  symbol: string,
  amount: string,
  time: string,
  state: string,
}

export interface AdminSwapOrder {
  base: string,
  target: string,
  userID: string,
  amount: string,
  time: string,
  state: string,
}

export interface AdminSingleKey {
  key_id: string;
  exchange: string;
  exchange_index: string;
  name: string;
  api_key: string;
  api_secret: string;
  permissions?: string;
  state?: string;
  created_at?: string;
  last_update?: string;
}