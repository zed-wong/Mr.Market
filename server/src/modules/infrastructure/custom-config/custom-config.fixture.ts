type CustomConfigEntity = {
  config_id: number;
  max_balance_mixin_bot: string;
  max_balance_single_api_key: string;
  funding_account: string;
  spot_fee: string;
  market_making_fee: string;
  enable_spot_fee: boolean;
  enable_market_making_fee: boolean;
};

function createMockCustomConfigEntity(
  overrides?: Partial<CustomConfigEntity>,
): CustomConfigEntity {
  return {
    config_id: 1,
    max_balance_mixin_bot: '1000',
    max_balance_single_api_key: '2000',
    funding_account: 'XYZ123',
    spot_fee: '0.02',
    market_making_fee: '0.001',
    enable_spot_fee: true,
    enable_market_making_fee: true,
    ...overrides,
  };
}

export default createMockCustomConfigEntity;
