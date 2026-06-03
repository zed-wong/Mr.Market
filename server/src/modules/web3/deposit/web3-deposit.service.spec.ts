import { BadRequestException } from '@nestjs/common';

import { Web3DepositService } from './web3-deposit.service';

describe('Web3DepositService', () => {
  const receiverAddress = '0x2222222222222222222222222222222222222222';
  const sepoliaUsdc = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';

  const buildService = () => {
    const web3Service = {
      getOperatorAddress: jest.fn(() => receiverAddress),
    };
    const service = new Web3DepositService(web3Service as never);

    return { service, web3Service };
  };

  it('returns Router funding instructions and supported tokens', () => {
    const { service, web3Service } = buildService();

    const result = service.getInstructions('11155111');

    expect(web3Service.getOperatorAddress).toHaveBeenCalledWith(11155111);
    expect(result).toMatchObject({
      namespace: '/web3/funding-requests',
      chainId: 11155111,
      receiverAddress,
    });
    expect(result.supportedTokens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chainId: 11155111,
          symbol: 'USDC',
          tokenAddress: sepoliaUsdc,
          decimals: 6,
        }),
      ]),
    );
  });

  it('resolves supported EVM token metadata for Router requests', () => {
    const { service } = buildService();

    expect(
      service.resolveSupportedTokenForChain(
        11155111,
        sepoliaUsdc.toLowerCase(),
      ),
    ).toMatchObject({
      assetId: 'evm:11155111:0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
      tokenAddress: sepoliaUsdc,
      decimals: 6,
    });
  });

  it('rejects unsupported chains and tokens with validation errors', () => {
    const { service } = buildService();

    expect(() => service.getInstructions('999999')).toThrow(
      BadRequestException,
    );
    expect(() =>
      service.resolveSupportedTokenForChain(
        11155111,
        '0x3333333333333333333333333333333333333333',
      ),
    ).toThrow(BadRequestException);
  });
});
