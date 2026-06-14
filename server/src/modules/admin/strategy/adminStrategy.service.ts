/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ethers } from 'ethers';
import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import {
  StrategyDefinition,
  StrategyDefinitionVisibility,
} from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import {
  getInfoFromChainId,
  getTokenSymbolByContractAddress,
} from 'src/common/helpers/blockchain-utils';
import { getRFC3339Timestamp } from 'src/common/helpers/utils';
import { In, Repository } from 'typeorm';

import { ExchangeInitService } from '../../infrastructure/exchange-init/exchange-init.service';
import { normalizeControllerType } from '../../market-making/strategy/config/strategy-controller-aliases';
import { StrategyConfigResolverService } from '../../market-making/strategy/dex/strategy-config-resolver.service';
import { StrategyRuntimeDispatcherService } from '../../market-making/strategy/execution/strategy-runtime-dispatcher.service';
import { StrategyService } from '../../market-making/strategy/strategy.service';
import { Web3Service } from '../../web3/web3.service';
import {
  GetDepositAddressDto,
  RemoveStrategyDefinitionDto,
  StartStrategyInstanceDto,
  StopStrategyInstanceDto,
  StrategyDefinitionDto,
  UpdateStrategyDefinitionDto,
} from './admin-strategy.dto';
import { attachStrategyDefinitionCapabilities } from './strategy-definition-capabilities';

@Injectable()
export class AdminStrategyService {
  constructor(
    private readonly strategyService: StrategyService,
    private readonly strategyConfigResolver: StrategyConfigResolverService,
    private readonly strategyRuntimeDispatcher: StrategyRuntimeDispatcherService,
    private readonly exchangeInitService: ExchangeInitService,
    private readonly web3Service: Web3Service,
    @InjectRepository(StrategyDefinition)
    private strategyDefinitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(StrategyInstance)
    private strategyInstanceRepository: Repository<StrategyInstance>,
    @InjectRepository(Contribution)
    private contributionRepository: Repository<Contribution>,
    @InjectRepository(MixinUser)
    private mixinuserrepository: Repository<MixinUser>,
  ) {}

  async getDepositAddress(getDepositAddressDto: GetDepositAddressDto) {
    const { exchangeName, tokenSymbol, network, accountLabel } =
      getDepositAddressDto;
    const depositAddress = this.exchangeInitService.getDepositAddress(
      exchangeName,
      tokenSymbol,
      network,
      accountLabel,
    );

    return depositAddress;
  }

  async getSupportedNetworks(
    exchangeName: string,
    tokenSymbol: string,
    accountLabel: string,
  ) {
    const exchange = this.exchangeInitService.getExchange(
      exchangeName,
      accountLabel,
    );

    const currency = exchange.currencies[tokenSymbol];

    if (!currency) {
      throw new BadRequestException(
        `Token ${tokenSymbol} is not supported on ${exchangeName}.`,
      );
    }

    // Check if the exchange provides information about deposit networks
    const networks = currency.networks || [];

    // Map out the available deposit networks for the token
    const supportedNetworks = Object.keys(networks).map((network) => ({
      network,
      ...networks[network], // You can include additional details if needed
    }));

    if (supportedNetworks.length === 0) {
      throw new BadRequestException(
        `No deposit networks found for ${tokenSymbol} on ${exchangeName}.`,
      );
    }

    return supportedNetworks;
  }

  async getSupportedExchanges() {
    return this.exchangeInitService.getSupportedExchanges();
  }

  async getAllCcxtExchanges() {
    return this.exchangeInitService.getAllCcxtExchanges();
  }

  async getCcxtExchangeDetails(exchangeId: string) {
    return this.exchangeInitService.getCcxtExchangeDetails(exchangeId);
  }

  async getCcxtExchangeMarkets(exchangeId: string) {
    return this.exchangeInitService.getCcxtExchangeMarkets(exchangeId);
  }

  async getChainInfo(chainId: number): Promise<any> {
    try {
      // Call the utility function to get chain info from chainId
      const chainInfo = await getInfoFromChainId(chainId);

      return chainInfo;
    } catch (error) {
      throw new BadRequestException(
        `Failed to get chain info: ${error.message}`,
      );
    }
  }

  async joinStrategy(
    userId: string,
    clientId: string,
    strategyKey: string,
    amount: number,
    transactionHash: string,
    tokenSymbol: string,
    chainId: number,
    tokenAddress: string,
  ) {
    const strategy = await this.strategyService.getStrategyInstanceKey(
      strategyKey,
    );

    if (!strategy || strategy.status !== 'running') {
      throw new BadRequestException(`Strategy ${strategyKey} is not active`);
    }

    // Fetch the user entity
    const mixinUser = await this.mixinuserrepository.findOne({
      where: { user_id: userId },
    });

    if (!mixinUser) {
      throw new BadRequestException(`User ${userId} does not exist`);
    }

    const contribution = this.contributionRepository.create({
      userId,
      clientId,
      mixinUser,
      strategy,
      amount,
      transactionHash,
      status: 'pending', // Set status as pending until verification
      tokenSymbol,
      chainId,
      tokenAddress,
    });

    await this.contributionRepository.save(contribution);

    return {
      message: `User ${userId} has joined the strategy with ${amount} funds`,
    };
  }

  async verifyContribution(contributionId: string): Promise<boolean> {
    const contribution = await this.contributionRepository.findOne({
      where: { id: contributionId },
    });

    if (!contribution) {
      throw new BadRequestException(
        `Contribution ${contributionId} does not exist`,
      );
    }

    const { transactionHash, amount, userId, chainId, tokenAddress } =
      contribution;

    // Fetch the user associated with the contribution
    const user = await this.mixinuserrepository.findOne({
      where: { user_id: userId },
    });

    if (!user) {
      throw new BadRequestException(
        `User associated with contribution does not exist`,
      );
    }

    // Verify the transaction details on the blockchain
    const isVerified = await this.web3Service.verifyTransactionDetails(
      chainId,
      transactionHash,
      tokenAddress,
      user.walletAddress, // Using the `walletAddress` field from the user entity
      ethers.BigNumber.from(amount),
    );

    if (isVerified) {
      // Update the contribution status to confirmed
      contribution.status = 'confirmed';
      await this.contributionRepository.save(contribution);

      return true;
    }

    return false;
  }

  async getTokenSymbolByContract(
    contractAddress: string,
    chainId: number,
  ): Promise<string> {
    try {
      // Call the utility function to get token symbol by contract address and chain ID
      return await getTokenSymbolByContractAddress(contractAddress, chainId);
    } catch (error) {
      throw new BadRequestException(
        `Failed to get token symbol: ${error.message}`,
      );
    }
  }

  async getRunningStrategies() {
    return this.strategyService.getRunningStrategies();
  }

  async createStrategyDefinition(
    dto: StrategyDefinitionDto,
  ): Promise<StrategyDefinition> {
    const controllerType = normalizeControllerType(dto.controllerType);

    if (!controllerType) {
      throw new BadRequestException('controllerType is required');
    }
    this.strategyRuntimeDispatcher.toStrategyType(controllerType);

    const existing = await this.strategyDefinitionRepository.findOne({
      where: { key: dto.key },
    });

    if (existing) {
      throw new BadRequestException(
        `Strategy definition with key ${dto.key} already exists`,
      );
    }

    const definition = this.strategyDefinitionRepository.create({
      key: dto.key,
      name: dto.name,
      description: dto.description,
      controllerType,
      configSchema: dto.configSchema,
      defaultConfig: dto.defaultConfig,
      capabilities: dto.capabilities,
      enabled: true,
      visibility: dto.visibility || StrategyDefinitionVisibility.ADMIN,
      createdBy: dto.createdBy,
    });

    return attachStrategyDefinitionCapabilities(
      await this.strategyDefinitionRepository.save(definition),
    );
  }

  async listStrategyDefinitions(): Promise<StrategyDefinition[]> {
    const definitions = await this.strategyDefinitionRepository.find({
      order: { key: 'ASC' },
    });

    return definitions.map((definition) =>
      attachStrategyDefinitionCapabilities(definition),
    );
  }

  async getStrategyDefinition(id: string): Promise<StrategyDefinition> {
    const definition = await this.strategyDefinitionRepository.findOne({
      where: { id },
    });

    if (!definition) {
      throw new BadRequestException(`Strategy definition ${id} does not exist`);
    }

    return attachStrategyDefinitionCapabilities(definition);
  }

  async updateStrategyDefinition(
    id: string,
    dto: UpdateStrategyDefinitionDto,
  ): Promise<StrategyDefinition> {
    const definition = await this.getStrategyDefinition(id);

    definition.name = dto.name ?? definition.name;
    definition.description = dto.description ?? definition.description;
    definition.configSchema = dto.configSchema ?? definition.configSchema;
    definition.defaultConfig = dto.defaultConfig ?? definition.defaultConfig;
    definition.capabilities = dto.capabilities ?? definition.capabilities;
    definition.visibility = dto.visibility ?? definition.visibility;
    definition.controllerType = dto.controllerType
      ? normalizeControllerType(dto.controllerType)
      : definition.controllerType;
    this.strategyRuntimeDispatcher.toStrategyType(definition.controllerType);

    return attachStrategyDefinitionCapabilities(
      await this.strategyDefinitionRepository.save(definition),
    );
  }

  async setStrategyDefinitionEnabled(
    id: string,
    enabled: boolean,
  ): Promise<StrategyDefinition> {
    const definition = await this.getStrategyDefinition(id);

    definition.enabled = enabled;

    return attachStrategyDefinitionCapabilities(
      await this.strategyDefinitionRepository.save(definition),
    );
  }

  async removeStrategyDefinition(dto: RemoveStrategyDefinitionDto): Promise<{
    message: string;
    strategyDefinitionId: string;
  }> {
    const definition = await this.getStrategyDefinition(
      dto.strategyDefinitionId,
    );

    if (definition.enabled) {
      throw new BadRequestException(
        `Strategy definition ${definition.key} must be disabled before removal`,
      );
    }

    const linkedInstance = await this.strategyInstanceRepository.findOne({
      where: { strategyDefinitionId: definition.id },
      order: { updatedAt: 'DESC' },
    });

    if (linkedInstance) {
      throw new BadRequestException(
        `Strategy definition ${definition.key} is linked to existing strategy instances and cannot be removed`,
      );
    }

    await this.strategyDefinitionRepository.delete({ id: definition.id });

    return {
      message: `Removed strategy definition ${definition.key}`,
      strategyDefinitionId: definition.id,
    };
  }

  async getStrategyInstances(runningOnly = false): Promise<
    Array<{
      id: number;
      strategyKey: string;
      strategyType: string;
      status: string;
      userId: string;
      clientId: string;
      marketMakingOrderId?: string;
      strategyDefinitionId?: string;
      strategyDefinitionSnapshot?: {
        strategyDefinitionId: string;
        definitionKey: string;
        definitionName: string;
        controllerType: string;
        resolvedAt: string;
      };
      definitionKey?: string;
      definitionName?: string;
      controllerType?: string;
      createdAt: string;
      updatedAt: string;
    }>
  > {
    const instances = runningOnly
      ? await this.strategyService.getRunningStrategies()
      : await this.strategyService.getAllStrategies();
    const strategyDefinitionIds = [
      ...new Set(instances.map((i) => i.strategyDefinitionId).filter(Boolean)),
    ] as string[];

    const definitions = strategyDefinitionIds.length
      ? await this.strategyDefinitionRepository.find({
          where: { id: In(strategyDefinitionIds) },
        })
      : [];
    const definitionMap = new Map(definitions.map((d) => [d.id, d]));

    return instances.map((instance) => {
      const definition = instance.strategyDefinitionId
        ? definitionMap.get(instance.strategyDefinitionId)
        : undefined;
      const controllerType = definition
        ? this.strategyConfigResolver.getDefinitionControllerType(definition)
        : instance.strategyDefinitionSnapshot?.controllerType;

      return {
        id: instance.id,
        strategyKey: instance.strategyKey,
        strategyType: instance.strategyType,
        status: instance.status,
        userId: instance.userId,
        clientId: instance.clientId,
        marketMakingOrderId: instance.marketMakingOrderId,
        strategyDefinitionId: instance.strategyDefinitionId,
        strategyDefinitionSnapshot: instance.strategyDefinitionSnapshot,
        definitionKey:
          definition?.key || instance.strategyDefinitionSnapshot?.definitionKey,
        definitionName:
          definition?.name ||
          instance.strategyDefinitionSnapshot?.definitionName,
        controllerType,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
      };
    });
  }

  async startStrategyInstance(dto: StartStrategyInstanceDto): Promise<{
    message: string;
    strategyDefinitionId: string;
    controllerType: string;
  }> {
    const definition = await this.getStrategyDefinition(
      dto.strategyDefinitionId,
    );
    const { mergedConfig, strategyType } =
      this.strategyConfigResolver.resolveDefinitionStartConfig(definition, dto);
    const controllerType =
      this.strategyConfigResolver.getDefinitionControllerType(definition);

    await this.strategyRuntimeDispatcher.startByStrategyType(
      strategyType,
      mergedConfig,
    );
    await this.strategyService.linkDefinitionToStrategyInstance(
      dto.userId,
      dto.clientId,
      strategyType,
      definition.id,
      strategyType === 'pureMarketMaking'
        ? dto.marketMakingOrderId || dto.clientId
        : undefined,
      {
        strategyDefinitionId: definition.id,
        definitionKey: definition.key,
        definitionName: definition.name,
        controllerType,
        resolvedAt: getRFC3339Timestamp(),
      },
    );

    return {
      message: `Started strategy instance from definition ${definition.key}`,
      strategyDefinitionId: definition.id,
      controllerType,
    };
  }

  async validateStrategyInstanceConfig(dto: StartStrategyInstanceDto): Promise<{
    valid: true;
    strategyDefinitionId: string;
    definitionKey: string;
    controllerType: string;
    mergedConfig: Record<string, any>;
  }> {
    const definition = await this.getStrategyDefinition(
      dto.strategyDefinitionId,
    );
    const { mergedConfig } =
      this.strategyConfigResolver.resolveDefinitionStartConfig(definition, dto);
    const controllerType =
      this.strategyConfigResolver.getDefinitionControllerType(definition);

    return {
      valid: true,
      strategyDefinitionId: definition.id,
      definitionKey: definition.key,
      controllerType,
      mergedConfig,
    };
  }

  async stopStrategyInstance(dto: StopStrategyInstanceDto): Promise<{
    message: string;
    strategyDefinitionId: string;
    controllerType: string;
  }> {
    const definition = await this.getStrategyDefinition(
      dto.strategyDefinitionId,
    );
    const controllerType =
      this.strategyConfigResolver.getDefinitionControllerType(definition);
    const strategyType =
      this.strategyRuntimeDispatcher.toStrategyType(controllerType);
    const targetId =
      strategyType === 'pureMarketMaking'
        ? dto.marketMakingOrderId || dto.clientId
        : dto.clientId;

    await this.strategyRuntimeDispatcher.stopByStrategyType(
      strategyType,
      dto.userId,
      targetId,
    );

    return {
      message: `Stopped strategy instance from definition ${definition.key}`,
      strategyDefinitionId: definition.id,
      controllerType,
    };
  }
}
