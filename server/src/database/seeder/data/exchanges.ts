/**
 * Top 10 exchanges by trading volume (CoinGecko/CoinMarketCap ranking)
 * CCXT ID is used for API integration
 * Icons sourced from docs.ccxt.com
 */
export const TOP_EXCHANGES = [
  {
    exchange_id: 'binance',
    name: 'Binance',
    icon_url:
      'https://github.com/user-attachments/assets/e9419b93-ccb0-46aa-9bff-c883f096274b',
    enable: true,
  },
  {
    exchange_id: 'okx',
    name: 'OKX',
    icon_url:
      'https://user-images.githubusercontent.com/1294454/152485636-38b19e4a-bece-4dec-979a-5982859ffc04.jpg',
    enable: true,
  },
  {
    exchange_id: 'bybit',
    name: 'Bybit',
    icon_url:
      'https://github.com/user-attachments/assets/97a5d0b3-de10-423d-90e1-6620960025ed',
    enable: true,
  },
  {
    exchange_id: 'coinbase',
    name: 'Coinbase',
    icon_url:
      'https://user-images.githubusercontent.com/1294454/40811661-b6eceae2-653a-11e8-829e-10bfadb078cf.jpg',
    enable: true,
  },
  {
    exchange_id: 'bitget',
    name: 'Bitget',
    icon_url:
      'https://github.com/user-attachments/assets/fbaa10cc-a277-441d-a5b7-997dd9a87658',
    enable: true,
  },
  {
    exchange_id: 'kraken',
    name: 'Kraken',
    icon_url:
      'https://user-images.githubusercontent.com/51840849/76173629-fc67fb00-61b1-11ea-84fe-f2de582f58a3.jpg',
    enable: true,
  },
  {
    exchange_id: 'gate',
    name: 'Gate.io',
    icon_url:
      'https://github.com/user-attachments/assets/64f988c5-07b6-4652-b5c1-679a6bf67c85',
    enable: true,
  },
  {
    exchange_id: 'kucoin',
    name: 'KuCoin',
    icon_url:
      'https://user-images.githubusercontent.com/51840849/87295558-132aaf80-c50e-11ea-9801-a2fb0c57c799.jpg',
    enable: true,
  },
  {
    exchange_id: 'htx',
    name: 'HTX',
    icon_url:
      'https://user-images.githubusercontent.com/1294454/76137448-22748a80-604e-11ea-8069-6e389271911d.jpg',
    enable: true,
  },
  {
    exchange_id: 'mexc',
    name: 'MEXC',
    icon_url:
      'https://user-images.githubusercontent.com/1294454/137283979-8b2a818d-8633-461b-bfca-de89e8c446b2.jpg',
    enable: true,
  },
] as const;

export type ExchangeConfig = (typeof TOP_EXCHANGES)[number];
