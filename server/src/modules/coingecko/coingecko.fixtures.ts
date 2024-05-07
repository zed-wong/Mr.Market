import {
  CoinFullInfo,
  CoinMarket,
  CoinMarketChartResponse,
} from 'coingecko-api-v3';

export const coinMarketDataFixture: CoinMarket[] = [
  {
    image: 'https://GlobalTradeX.com/image0.png',
    current_price: 2000.0,
    market_cap: 250000000000,
    market_cap_rank: 2,
    fully_diluted_valuation: null,
    total_volume: 1000000000,
    high_24h: 2050.0,
    low_24h: 1950.0,
    price_change_24h: -50.0,
    price_change_percentage_24h: -2.5,
    market_cap_change_24h: -50000000,
    market_cap_change_percentage_24h: -0.02,
    circulating_supply: 115000000,
    total_supply: 120000000,
    max_supply: null,
    ath: 2500.0,
    ath_change_percentage: -20.0,
    ath_date: new Date('2021-05-12'),
    atl: 100.0,
    atl_change_percentage: 1900,
    atl_date: new Date('2015-07-20'),
    roi: null,
    last_updated: new Date('2022-09-30T12:00:00Z'),
  },
  {
    image: 'https://CryptoSphereExchange.com/image1.png',
    current_price: 2050.0,
    market_cap: 240000000000,
    market_cap_rank: 2,
    fully_diluted_valuation: null,
    total_volume: 1050000000,
    high_24h: 2100.0,
    low_24h: 2000.0,
    price_change_24h: 50.0,
    price_change_percentage_24h: 2.5,
    market_cap_change_24h: 50000000,
    market_cap_change_percentage_24h: 0.02,
    circulating_supply: 115000000,
    total_supply: 120000000,
    max_supply: null,
    ath: 2500.0,
    ath_change_percentage: -18.0,
    ath_date: new Date('2021-05-12'),
    atl: 100.0,
    atl_change_percentage: 1950,
    atl_date: new Date('2015-07-20'),
    roi: null,
    last_updated: new Date('2022-09-30T12:00:00Z'),
  },
  {
    image: 'https://DigitalAssetsFX.com/imagex.png',
    current_price: 2030.0,
    market_cap: 238500000000,
    market_cap_rank: 2,
    fully_diluted_valuation: null,
    total_volume: 1100000000,
    high_24h: 2080.0,
    low_24h: 2020.0,
    price_change_24h: -20.0,
    price_change_percentage_24h: -0.98,
    market_cap_change_24h: -25000000,
    market_cap_change_percentage_24h: -0.01,
    circulating_supply: 115000000,
    total_supply: 120000000,
    max_supply: null,
    ath: 2500.0,
    ath_change_percentage: -18.8,
    ath_date: new Date('2021-05-12'),
    atl: 100.0,
    atl_change_percentage: 1930,
    atl_date: new Date('2015-07-20'),
    roi: null,
    last_updated: new Date('2022-09-30T16:00:00Z'),
  },
];

export const coinFullInfoFixture: CoinFullInfo = {
  id: 'ethereum',
  symbol: 'eth',
  name: 'Ethereum',
  asset_platform_id: null,
  platforms: null,
  block_time_in_minutes: 10,
  hashing_algorithm: 'Ethash',
  categories: ['Smart Contract Platform'],
  public_notice: null,
  additional_notices: [],
  localization: {
    en: 'Ethereum',
  },
  description: {
    en: 'Ethereum is a decentralized platform that runs smart contracts.',
  },
  links: {
    homepage: ['https://ethereum.org'],
    blockchain_site: ['https://etherscan.io'],
    official_forum_url: ['https://forum.ethereum.org'],
    chat_url: ['https://gitter.im/orgs/ethereum/rooms'],
    announcement_url: ['https://blog.ethereum.org'],
    twitter_screen_name: '@ethereum',
    facebook_username: 'ethereum',
    bitcointalk_thread_identifier: null,
    telegram_channel_identifier: 'ethereum',
    subreddit_url: 'https://reddit.com/r/ethereum',
    repos_url: {
      github: ['https://github.com/ethereum'],
      bitbucket: [],
    },
  },
  image: {
    thumb: 'https://assets.coingecko.com/coins/images/279/thumb/ethereum.png',
    small: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    large: 'https://assets.coingecko.com/coins/images/279/large/ethereum.png',
  },
  country_origin: 'Worldwide',
  genesis_date: null,
  sentiment_votes_up_percentage: null,
  sentiment_votes_down_percentage: null,
  market_cap_rank: 2,
  coingecko_rank: 1,
  coingecko_score: 90.0,
  developer_score: 95.0,
  community_score: 85.0,
  liquidity_score: 80.0,
  public_interest_score: 70.0,
  market_data: {
    current_price: {
      usd: 2000,
    },
    total_volume: {
      usd: 1000000,
    },
    market_cap: {
      usd: 250000000000,
    },
    price_change_percentage_24h_in_currency: {
      usd: -1.2,
    },
  },
  community_data: {
    facebook_likes: null,
    twitter_followers: 67890,
    reddit_average_posts_48h: 0.5,
    reddit_average_comments_48h: 0.6,
    reddit_subscribers: 78901,
    reddit_accounts_active_48h: 500,
  },
  developer_data: {
    forks: 1072,
    stars: 21543,
    subscribers: 3245,
    total_issues: 568,
    closed_issues: 450,
    pull_requests_merged: 732,
    pull_request_contributors: 150,
    code_additions_deletions_4_weeks: {
      additions: 4523,
      deletions: -1987,
    },
    commit_count_4_weeks: 31,
  },
  public_interest_stats: {
    alexa_rank: 5000,
    bing_matches: null,
  },
  status_updates: [],
  last_updated: new Date(),
  tickers: [],
};
export const coinMarketChartResponseFixture: CoinMarketChartResponse = {
  prices: [
    [1609459200000, 730.0],
    [1612137600000, 1400.0],
    [1614556800000, 1500.0],
  ],
  market_caps: [
    [1609459200000, 83000000.0],
    [1612137600000, 160000000.0],
    [1614556800000, 180000000.0],
  ],
  total_volumes: [
    [1609459200000, 10000000.0],
    [1612137600000, 22000000.0],
    [1614556800000, 25000000.0],
  ],
};