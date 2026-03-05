export type DexId = 'uniswapV3' | 'pancakeV3';

export type DexAddresses = {
  factory: string;
  router: string;
  quoterV2: string;
  weth: string; // canonical wrapped native for the chain
};

/**
 * IMPORTANT: Only put addresses you are certain about.
 * Fill in Pancake v3 addresses
 */
export const DEX_ADDRESSES: Record<DexId, Record<number, DexAddresses>> = {
  uniswapV3: {
    // Ethereum mainnet
    1: {
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    },
    // Arbitrum
    42161: {
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoterV2: '0x655C406EBFa14EE2006250925e54ec43AD184f8B',
      weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    },
    // Polygon
    137: {
      factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoterV2: '0x61fFE014bA17989E743c5F6cB21bF9697530B21e',
      weth: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    },
  },
  pancakeV3: {
    56: {
      factory: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
      router: '0x1b81D678ffb9C0263b24A97847620C99d213eB14',
      quoterV2: '0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997',
      weth: '0xBB4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // WBNB
    },
  },
};
