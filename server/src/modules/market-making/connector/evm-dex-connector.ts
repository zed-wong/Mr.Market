import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';
import { BigNumber as EthersBigNumber, ethers } from 'ethers';

import { EvmExecutionService } from '../evm-execution/evm-execution.service';
import { EvmReceiptConfirmerService } from '../evm-execution/evm-receipt-confirmer.service';
import { GasPriceOracleService } from '../evm-execution/gas-price-oracle.service';
import { NonceAllocatorService } from '../evm-execution/nonce-allocator.service';
import { OrderReservationService } from '../ledger/order-reservation.service';
import type { StrategyOrderIntent } from '../strategy/config/strategy-intent.types';
import { TokenRegistryService } from '../token-registry/token-registry.service';
import { TradingAccountService } from '../trading-account/trading-account.service';
import { EvmDexAdapterRegistry } from './adapters/evm-dex-adapter-registry';
import { readDecimals } from './adapters/utils/erc20';
import {
  Connector,
  ConnectorActionResult,
  ConnectorCapability,
  ConnectorState,
  ExchangeType,
} from './connector.types';

@Injectable()
export class EvmDexConnector implements Connector {
  readonly connectorId = 'evm-dex';
  readonly exchangeType: ExchangeType = 'amm';

  constructor(
    private readonly evmDexAdapterRegistry: EvmDexAdapterRegistry,
    private readonly tradingAccountService: TradingAccountService,
    private readonly tokenRegistryService: TokenRegistryService,
    private readonly nonceAllocatorService: NonceAllocatorService,
    private readonly evmExecutionService: EvmExecutionService,
    private readonly gasPriceOracleService: GasPriceOracleService,
    private readonly evmReceiptConfirmerService: EvmReceiptConfirmerService,
    private readonly orderReservationService: OrderReservationService,
  ) {}

  get capabilities(): ConnectorCapability {
    return {
      connectorId: this.connectorId,
      exchangeType: this.exchangeType,
      settlementDomain: 'evm_chain',
      supportedIntentTypes: [
        'EXECUTE_AMM_SWAP',
        'ADD_LIQUIDITY',
        'REMOVE_LIQUIDITY',
        'COLLECT_FEES',
      ],
      supportsOpenOrders: false,
      supportsAtomicSwap: true,
      supportsLpPositions: true,
      requiresOnchainConfirmations: true,
      supportedChainIds: [1, 56, 137],
    };
  }

  async submitAction(
    intent: StrategyOrderIntent,
  ): Promise<ConnectorActionResult> {
    const metadata = this.readMetadata(intent);
    const connectorId = this.readConnectorId(intent);
    const chainId = this.readChainId(metadata);
    const tradingAccountId = String(metadata.tradingAccountId || '');

    if (intent.type !== 'EXECUTE_AMM_SWAP') {
      return {
        status: 'not_supported',
        details: {
          reason: 'evm_dex_intent_type_not_implemented',
          connectorId,
          chainId,
          intentType: intent.type,
        },
      };
    }

    if (!tradingAccountId) {
      throw new Error('EVM DEX intent metadata missing tradingAccountId');
    }

    const adapter = this.evmDexAdapterRegistry.get(connectorId);
    const signer = await this.tradingAccountService.getSigner(
      tradingAccountId,
      chainId,
    );

    if (!signer.provider) {
      throw new Error(`No provider configured for chainId=${chainId}`);
    }

    if (!adapter.supportsChain(chainId)) {
      throw new Error(
        `EVM DEX connector ${connectorId} is not configured for chainId=${chainId}`,
      );
    }

    const tokenIn = ethers.utils.getAddress(String(metadata.tokenIn || ''));
    const tokenOut = ethers.utils.getAddress(String(metadata.tokenOut || ''));
    const effectiveTokenIn = intent.side === 'sell' ? tokenOut : tokenIn;
    const effectiveTokenOut = intent.side === 'sell' ? tokenIn : tokenOut;

    const tokenInAssetId = await this.tokenRegistryService.resolveAssetId(
      chainId,
      effectiveTokenIn,
    );
    await this.tokenRegistryService.resolveAssetId(chainId, effectiveTokenOut);

    const feeTier = Number(metadata.feeTier || metadata.fee || 0);

    if (!Number.isInteger(feeTier) || feeTier <= 0) {
      throw new Error('EXECUTE_AMM_SWAP intent metadata missing feeTier');
    }

    const pool = await adapter.getPool(
      signer.provider,
      chainId,
      effectiveTokenIn,
      effectiveTokenOut,
      feeTier,
    );

    if (!pool || pool === ethers.constants.AddressZero) {
      throw new Error(
        `No v3 pool found for ${connectorId} chainId=${chainId} feeTier=${feeTier}`,
      );
    }

    const tokenInDecimals = await readDecimals(
      signer.provider,
      effectiveTokenIn,
    );
    const amountIn = this.resolveAmountIn(metadata, intent, tokenInDecimals);
    const quote = await adapter.quoteExactInputSingle(
      signer.provider,
      chainId,
      {
        tokenIn: effectiveTokenIn,
        tokenOut: effectiveTokenOut,
        amountIn,
        fee: feeTier,
      },
    );
    const slippageBps = this.resolveSlippageBps(metadata);
    const amountOutMinimum = quote.amountOut
      .mul(10_000 - slippageBps)
      .div(10_000);

    if (amountOutMinimum.lte(EthersBigNumber.from(0))) {
      throw new Error('Computed amountOutMinimum is non-positive');
    }

    const owner = ethers.utils.getAddress(await signer.getAddress());
    const recipient = metadata.recipient
      ? ethers.utils.getAddress(String(metadata.recipient))
      : owner;
    const swapParams = {
      tokenIn: effectiveTokenIn,
      tokenOut: effectiveTokenOut,
      fee: feeTier,
      recipient,
      deadline: this.resolveDeadline(metadata),
      amountIn,
      amountOutMinimum,
    };
    const gasLimit = await adapter.estimateGasExactInputSingle(
      signer,
      chainId,
      swapParams,
    );
    const gasQuote = await this.gasPriceOracleService.quoteGasPrice(
      chainId,
      tradingAccountId,
    );
    const userOrderId = this.readUserOrderId(intent, metadata);
    const ledgerOrderId = this.readLedgerOrderId(intent, metadata);
    const gasSponsorLedgerOrderId =
      this.readGasSponsorLedgerOrderId(metadata);

    if (!gasSponsorLedgerOrderId) {
      throw new Error(
        'EXECUTE_AMM_SWAP intent metadata missing gasSponsorLedgerOrderId',
      );
    }

    await this.orderReservationService.reserveForAmmSwapTokenIn({
      orderId: ledgerOrderId,
      userOrderId,
      accountLabel: intent.accountLabel || 'default',
      userId: intent.userId,
      intentId: intent.intentId,
      assetId: tokenInAssetId,
      tradingAccountId,
      chainId,
      amount: ethers.utils.formatUnits(amountIn, tokenInDecimals),
    });
    await this.reserveGasSponsor({
      chainId,
      tradingAccountId,
      gasSponsorLedgerOrderId,
      userOrderId,
      userId: intent.userId,
      intentId: intent.intentId,
      gasLimit,
      gasPrice: gasQuote.maxFeePerGas || gasQuote.gasPrice,
    });

    const confirmationPolicy =
      this.evmReceiptConfirmerService.getConfirmationPolicy(chainId);
    const execution = await this.nonceAllocatorService.preAllocate({
      executionType: 'swap',
      userOrderId,
      userId: intent.userId,
      ledgerOrderId,
      accountLabel: intent.accountLabel || 'default',
      intentId: intent.intentId,
      connectorId,
      exchangeType: 'amm',
      chainId,
      tradingAccountId,
      requiredConfirmations: confirmationPolicy.requiredConfirmations,
      gasSponsorLedgerOrderId,
    });
    const tx = await adapter.exactInputSingle(signer, chainId, {
      ...swapParams,
      transaction: {
        nonce: execution.nonce,
        gasLimit,
        gasPrice: gasQuote.maxFeePerGas ? undefined : gasQuote.gasPrice,
        maxFeePerGas: gasQuote.maxFeePerGas,
        maxPriorityFeePerGas: gasQuote.maxPriorityFeePerGas,
      },
    });
    const submitted = await this.evmExecutionService.markSubmitted(
      execution.id,
      tx.hash,
    );

    return {
      status: 'submitted',
      txHash: tx.hash,
      evmExecutionId: submitted.id,
      details: {
        connectorId,
        chainId,
        intentType: intent.type,
        amountIn: amountIn.toString(),
        quotedAmountOut: quote.amountOut.toString(),
        amountOutMinimum: amountOutMinimum.toString(),
        slippageBps,
        gasLimit: gasLimit.toString(),
      },
    };
  }

  async cancelAction(
    intent: StrategyOrderIntent,
  ): Promise<ConnectorActionResult> {
    return {
      status: 'not_supported',
      details: {
        reason: 'on_chain_tx_cannot_be_cancelled',
        connectorId: this.readConnectorId(intent),
        intentType: intent.type,
      },
    };
  }

  async queryState(intent: StrategyOrderIntent): Promise<ConnectorState> {
    return {
      status: 'no_execution',
      details: {
        reason: 'evm_execution_lifecycle_not_implemented_until_phase_4',
        connectorId: this.readConnectorId(intent),
      },
    };
  }

  private readMetadata(intent: StrategyOrderIntent): Record<string, unknown> {
    return intent.metadata && typeof intent.metadata === 'object'
      ? intent.metadata
      : {};
  }

  private readConnectorId(
    intent: StrategyOrderIntent,
  ): 'uniswapV3' | 'pancakeV3' {
    const connectorId = intent.connectorId || intent.exchange;

    if (connectorId === 'uniswapV3' || connectorId === 'pancakeV3') {
      return connectorId;
    }

    throw new Error(`Unsupported EVM DEX connectorId ${connectorId}`);
  }

  private readChainId(metadata: Record<string, unknown>): number {
    const chainId = Number(metadata.chainId || 0);

    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw new Error('EVM DEX intent metadata missing positive chainId');
    }

    return chainId;
  }

  private resolveAmountIn(
    metadata: Record<string, unknown>,
    intent: StrategyOrderIntent,
    tokenInDecimals: number,
  ): EthersBigNumber {
    if (metadata.amountIn) {
      return EthersBigNumber.from(String(metadata.amountIn));
    }

    const baseAmountInput =
      metadata.baseTradeAmount !== undefined
        ? String(metadata.baseTradeAmount)
        : intent.qty;
    const baseAmount = new BigNumber(baseAmountInput);
    const pushMultiplier = new BigNumber(1).plus(
      new BigNumber(Number(metadata.pricePushRate || 0))
        .dividedBy(100)
        .multipliedBy(Number(metadata.executedTrades || 0)),
    );
    const incrementMultiplier = new BigNumber(1).plus(
      new BigNumber(Number(metadata.baseIncrementPercentage || 0)).dividedBy(
        100,
      ),
    );
    const amountIn = baseAmount
      .multipliedBy(pushMultiplier)
      .multipliedBy(incrementMultiplier);

    if (!amountIn.isFinite() || amountIn.isLessThanOrEqualTo(0)) {
      throw new Error(`Computed amountIn is invalid: ${amountIn.toFixed()}`);
    }

    return ethers.utils.parseUnits(
      amountIn.decimalPlaces(tokenInDecimals, BigNumber.ROUND_DOWN).toFixed(),
      tokenInDecimals,
    );
  }

  private resolveSlippageBps(metadata: Record<string, unknown>): number {
    const fallbackBps = Math.round(
      Number(metadata.baseIncrementPercentage || 0) * 100,
    );
    const candidate = Number(
      metadata.slippageBps !== undefined ? metadata.slippageBps : fallbackBps,
    );

    if (!Number.isFinite(candidate)) {
      return 100;
    }

    return Math.max(1, Math.min(5000, Math.floor(candidate)));
  }

  private resolveDeadline(metadata: Record<string, unknown>): number {
    const deadlineSeconds = Number(metadata.deadlineSeconds || 120);

    return Math.floor(Date.now() / 1000) + Math.max(1, deadlineSeconds);
  }

  private readUserOrderId(
    intent: StrategyOrderIntent,
    metadata: Record<string, unknown>,
  ): string {
    return String(metadata.userOrderId || intent.clientId);
  }

  private readLedgerOrderId(
    intent: StrategyOrderIntent,
    metadata: Record<string, unknown>,
  ): string {
    return String(
      metadata.ledgerOrderId || metadata.userOrderId || intent.clientId,
    );
  }

  private readGasSponsorLedgerOrderId(
    metadata: Record<string, unknown>,
  ): string | undefined {
    return metadata.gasSponsorLedgerOrderId
      ? String(metadata.gasSponsorLedgerOrderId)
      : undefined;
  }

  private async reserveGasSponsor(command: {
    chainId: number;
    tradingAccountId: string;
    gasSponsorLedgerOrderId: string;
    userOrderId: string;
    userId: string;
    intentId: string;
    gasLimit: EthersBigNumber;
    gasPrice: EthersBigNumber;
  }): Promise<void> {
    const gasAssetId = await this.tokenRegistryService.resolveNativeAssetId(
      command.chainId,
    );
    const gasToken = await this.tokenRegistryService.resolveToken(gasAssetId);
    const estimatedGasCost = ethers.utils.formatUnits(
      command.gasLimit.mul(command.gasPrice),
      gasToken.decimals,
    );

    await this.orderReservationService.reserveForGasSponsor({
      orderId: command.gasSponsorLedgerOrderId,
      userOrderId: command.userOrderId,
      accountLabel: 'funding_operator',
      userId: command.userId,
      intentId: command.intentId,
      gasAssetId,
      estimatedGasCost,
      tradingAccountId: command.tradingAccountId,
      chainId: command.chainId,
    });
  }
}
