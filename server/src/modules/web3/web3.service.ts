import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BigNumber, ethers, Wallet } from 'ethers';

@Injectable()
export class Web3Service {
  private signers: { [key: number]: Wallet } = {};
  private operatorAddress?: string;
  public readonly logger = new Logger(Web3Service.name);

  constructor(private readonly configService: ConfigService) {
    const privateKey = this.configService.get<string>('web3.private_key');

    const networks = [
      {
        chainId: 1,
        rpcUrl: this.configService.get<string>('web3.network.mainnet.rpc_url'),
      },
      {
        chainId: 11155111,
        rpcUrl: this.configService.get<string>('web3.network.sepolia.rpc_url'),
      },
      {
        chainId: 137,
        rpcUrl: this.configService.get<string>('web3.network.polygon.rpc_url'),
      },
      {
        chainId: 80002,
        rpcUrl: this.configService.get<string>(
          'web3.network.polygon_amoy.rpc_url',
        ),
      },
      {
        chainId: 56,
        rpcUrl: this.configService.get<string>('web3.network.bsc.rpc_url'),
      },
      {
        chainId: 97,
        rpcUrl: this.configService.get<string>(
          'web3.network.bsc_testnet.rpc_url',
        ),
      },
    ];

    if (privateKey) {
      try {
        this.operatorAddress = new Wallet(privateKey).address;
      } catch (error) {
        this.logger.warn(
          `Invalid web3 private key configuration: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    for (const network of networks) {
      if (network.rpcUrl && privateKey) {
        const provider = new ethers.providers.JsonRpcProvider(network.rpcUrl);

        this.signers[network.chainId] = new Wallet(privateKey, provider);
      }
    }
  }

  public getSigner(chainId: number): Wallet {
    return this.signers[chainId];
  }

  public async calculateGasPrice(chainId: number): Promise<bigint> {
    const signer = this.getSigner(chainId);
    const multiplier = this.configService.get<number>('web3.gas_multiplier');
    const gasPrice = (await signer.provider?.getFeeData())?.gasPrice;

    if (gasPrice) {
      return gasPrice
        .mul(BigNumber.from(Math.round(multiplier * 100)))
        .div(BigNumber.from(100))
        .toBigInt();
    }
    throw new Error('Failed to get gas price');
  }

  public getOperatorAddress(chainId?: number): string {
    if (chainId && this.signers[chainId]) {
      return this.signers[chainId].address;
    }
    if (this.operatorAddress) {
      return this.operatorAddress;
    }
    const firstSigner = Object.values(this.signers)[0];

    if (firstSigner) {
      return firstSigner.address;
    }

    throw new Error('Web3 operator private key is not configured');
  }

  public async transferErc20(
    chainId: number,
    tokenAddress: string,
    recipientAddress: string,
    amount: ethers.BigNumber,
  ): Promise<{ txHash: string }> {
    const signer = this.getSigner(chainId);

    if (!signer?.provider) {
      throw new Error(`Web3 signer is not configured for chain ${chainId}`);
    }

    const contract = new ethers.Contract(
      tokenAddress,
      ['function transfer(address to, uint256 value) returns (bool)'],
      signer,
    );
    const transaction = await contract.transfer(recipientAddress, amount);

    return { txHash: transaction.hash };
  }

  public async getTransactionReceipt(
    chainId: number,
    transactionHash: string,
  ): Promise<ethers.providers.TransactionReceipt | null> {
    const signer = this.getSigner(chainId);

    if (!signer?.provider) {
      throw new Error(`Web3 signer is not configured for chain ${chainId}`);
    }

    return await signer.provider.getTransactionReceipt(transactionHash);
  }

  public async getCurrentBlockNumber(chainId: number): Promise<number> {
    const signer = this.getSigner(chainId);

    if (!signer?.provider) {
      throw new Error(`Web3 signer is not configured for chain ${chainId}`);
    }

    return await signer.provider.getBlockNumber();
  }

  public async getLogs(
    chainId: number,
    filter: ethers.providers.Filter,
  ): Promise<ethers.providers.Log[]> {
    const signer = this.getSigner(chainId);

    if (!signer?.provider) {
      throw new Error(`Web3 signer is not configured for chain ${chainId}`);
    }

    return await signer.provider.getLogs(filter);
  }

  async verifyTransactionDetails(
    chainId: number,
    transactionHash: string,
    expectedTokenAddress: string,
    expectedToAddress: string,
    expectedAmount: ethers.BigNumber,
    expectedFromAddress?: string,
  ): Promise<boolean> {
    const signer = this.getSigner(chainId);

    if (!signer?.provider) {
      return false;
    }

    const transaction = await signer.provider?.getTransaction(transactionHash);
    const receipt = await signer.provider?.getTransactionReceipt(
      transactionHash,
    );

    if (!transaction || receipt?.status !== 1) {
      return false; // Transaction failed or not found
    }

    if (
      expectedFromAddress &&
      transaction.from.toLowerCase() !== expectedFromAddress.toLowerCase()
    ) {
      return false;
    }

    // Verify the transaction is to the correct token contract
    if (transaction.to?.toLowerCase() !== expectedTokenAddress.toLowerCase()) {
      return false;
    }

    // Decode transaction data for ERC-20 transfer
    const iface = new ethers.utils.Interface([
      'function transfer(address to, uint256 value)',
    ]);
    const decodedData = iface.decodeFunctionData('transfer', transaction.data);

    const toAddress = decodedData[0];
    const amount = decodedData[1];

    // Verify the recipient and amount
    return (
      toAddress.toLowerCase() === expectedToAddress.toLowerCase() &&
      amount.eq(expectedAmount)
    );
  }
}
