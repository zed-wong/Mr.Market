/**
 * Top 10 exchanges by trading volume (CoinGecko/CoinMarketCap ranking)
 * CCXT ID is used for API integration
 */
export const TOP_EXCHANGES = [
  {
    exchange_id: 'binance',
    name: 'Binance',
    icon_url:
      'https://user-images.githubusercontent.com/1294454/29604020-d5483cdc-87ee-11e7-94c7-d1a8d9169293.jpg',
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
      'https://user-images.githubusercontent.com/51840849/76547799-daff5b80-649e-11ea-87fb-3be9bac08954.jpg',
    enable: true,
  },
  {
    exchange_id: 'coinbase',
    name: 'Coinbase',
    icon_url:
      'https://user-images.githubusercontent.com/1294454/44539338-2c5fde00-a70b-11e8-9f20-6c3960f1d241.jpg',
    enable: true,
  },
  {
    exchange_id: 'bitget',
    name: 'Bitget',
    icon_url:
      'https://user-images.githubusercontent.com/1294454/195989417-4253ddb0-afbe-4a1c-9dea-9dbcd121fa5d.jpg',
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
      'https://user-images.githubusercontent.com/51840849/76547764-c7ec8b80-649e-11ea-885b-5df0a7c0666a.jpg',
    enable: true,
  },
  {
    exchange_id: 'kucoin',
    name: 'KuCoin',
    icon_url:
      'https://user-images.githubusercontent.com/51840849/76547739-bcc48d80-649e-11ea-9397-e1b8368f1a80.jpg',
    enable: true,
  },
  {
    exchange_id: 'htx',
    name: 'HTX',
    icon_url:
      'https://user-images.githubusercontent.com/1294454/76137401-425e5080-604e-11ea-81d9-58856bf14410.jpg',
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
