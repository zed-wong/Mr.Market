/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ethers } from 'ethers';
import { Contribution } from 'src/common/entities/campaign/contribution.entity';
import { StrategyDefinition } from 'src/common/entities/market-making/strategy-definition.entity';
import { StrategyDefinitionVersion } from 'src/common/entities/market-making/strategy-definition-version.entity';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { MixinUser } from 'src/common/entities/mixin/mixin-user.entity';
import {
  getInfoFromChainId,
  getTokenSymbolByContractAddress,
} from 'src/common/helpers/blockchain-utils';
import { In, Repository } from 'typeorm';

import { ExchangeInitService } from '../../infrastructure/exchange-init/exchange-init.service';
import { PerformanceService } from '../../market-making/performance/performance.service';
import { StrategyService } from '../../market-making/strategy/strategy.service';
import {
  ArbitrageStrategyDto,
  PureMarketMakingStrategyDto,
} from '../../market-making/strategy/strategy.dto';
import { Web3Service } from '../../web3/web3.service';
import {
  GetDepositAddressDto,
  StopStrategyInstanceDto,
  StartStrategyInstanceDto,
  StartStrategyDto,
  StrategyDefinitionDto,
  StopStrategyDto,
  PublishStrategyDefinitionVersionDto,
  UpdateStrategyDefinitionDto,
} from './admin-strategy.dto';

@Injectable()
export class AdminStrategyService {
  constructor(
    private readonly strategyService: StrategyService,
    private readonly performanceService: PerformanceService,
    private readonly exchangeInitService: ExchangeInitService,
    private readonly web3Service: Web3Service,
    @InjectRepository(StrategyDefinition)
    private strategyDefinitionRepository: Repository<StrategyDefinition>,
    @InjectRepository(StrategyDefinitionVersion)
    private strategyDefinitionVersionRepository: Repository<StrategyDefinitionVersion>,
    @InjectRepository(StrategyInstance)
    private strategyInstanceRepository: Repository<StrategyInstance>,
    @InjectRepository(Contribution)
    private contributionRepository: Repository<Contribution>,
    @InjectRepository(MixinUser)
    private mixinuserrepository: Repository<MixinUser>,
  ) {}

  async startStrategy(startStrategyDto: StartStrategyDto) {
    const { strategyType, arbitrageParams, marketMakingParams, volumeParams } =
      startStrategyDto;

    const definitionExecutorType =
      strategyType === 'marketMaking' ? 'pureMarketMaking' : strategyType;
    const legacyConfig =
      strategyType === 'arbitrage'
        ? {
            ...arbitrageParams,
            checkIntervalSeconds: startStrategyDto.checkIntervalSeconds,
            maxOpenOrders: startStrategyDto.maxOpenOrders,
          }
        : strategyType === 'marketMaking'
        ? marketMakingParams
        : volumeParams;

    if (legacyConfig?.userId && legacyConfig?.clientId) {
      const definition = await this.strategyDefinitionRepository.findOne({
        where: {
          executorType: definitionExecutorType,
          enabled: true,
        },
        order: { createdAt: 'ASC' },
      });

      if (definition) {
        return this.startStrategyInstance({
          definitionId: definition.id,
          userId: legacyConfig.userId,
          clientId: legacyConfig.clientId,
          config: legacyConfig as Record<string, unknown>,
        });
      }
    }

    if (strategyType === 'arbitrage' && arbitrageParams) {
      return this.strategyService.startArbitrageStrategyForUser(
        arbitrageParams, // Only pass arbitrage parameters
        startStrategyDto.checkIntervalSeconds,
        startStrategyDto.maxOpenOrders,
      );
    } else if (strategyType === 'marketMaking' && marketMakingParams) {
      return this.strategyService.executePureMarketMakingStrategy(
        marketMakingParams, // Only pass market making parameters
      );
    } else if (strategyType === 'volume' && volumeParams) {
      return this.strategyService.executeVolumeStrategy(
        volumeParams.exchangeName,
        volumeParams.symbol,
        volumeParams.incrementPercentage,
        volumeParams.intervalTime,
        volumeParams.tradeAmount,
        volumeParams.numTrades,
        volumeParams.userId,
        volumeParams.clientId,
        volumeParams.pricePushRate,
        volumeParams.postOnlySide,
      );
    } else {
      throw new BadRequestException('Invalid strategy parameters');
    }
  }

  async stopStrategy(stopStrategyDto: StopStrategyDto) {
    const { userId, clientId } = stopStrategyDto;
    const strategyType =
      stopStrategyDto.strategyType === 'marketMaking'
        ? 'pureMarketMaking'
        : stopStrategyDto.strategyType;

    return this.strategyService.stopStrategyForUser(
      userId,
      clientId,
      strategyType,
    );
  }
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
      executorType: dto.executorType,
      configSchema: dto.configSchema,
      defaultConfig: dto.defaultConfig,
      enabled: true,
      visibility: dto.visibility || 'system',
      currentVersion: '1.0.0',
      createdBy: dto.createdBy,
    });

    const saved = await this.strategyDefinitionRepository.save(definition);
    await this.createDefinitionVersionSnapshot(saved, saved.currentVersion);

    return saved;
  }

  async listStrategyDefinitions(): Promise<StrategyDefinition[]> {
    return this.strategyDefinitionRepository.find({
      order: { key: 'ASC' },
    });
  }

  async getStrategyDefinition(id: string): Promise<StrategyDefinition> {
    const definition = await this.strategyDefinitionRepository.findOne({
      where: { id },
    });

    if (!definition) {
      throw new BadRequestException(`Strategy definition ${id} does not exist`);
    }

    return definition;
  }

  async updateStrategyDefinition(
    id: string,
    dto: UpdateStrategyDefinitionDto,
  ): Promise<StrategyDefinition> {
    const definition = await this.getStrategyDefinition(id);
    Object.assign(definition, dto);

    return this.strategyDefinitionRepository.save(definition);
  }

  async publishStrategyDefinitionVersion(
    id: string,
    dto: PublishStrategyDefinitionVersionDto,
  ): Promise<StrategyDefinition> {
    const definition = await this.getStrategyDefinition(id);
    const nextVersion = dto.version
      ? this.validateVersion(dto.version)
      : this.incrementPatchVersion(definition.currentVersion || '1.0.0');

    const existingVersion = await this.strategyDefinitionVersionRepository.findOne(
      {
        where: {
          definitionId: definition.id,
          version: nextVersion,
        },
      },
    );

    if (existingVersion) {
      throw new BadRequestException(
        `Version ${nextVersion} already exists for definition ${definition.key}`,
      );
    }

    if (dto.name !== undefined) {
      definition.name = dto.name;
    }
    if (dto.description !== undefined) {
      definition.description = dto.description;
    }
    if (dto.executorType !== undefined) {
      definition.executorType = dto.executorType;
    }
    if (dto.configSchema !== undefined) {
      definition.configSchema = dto.configSchema;
    }
    if (dto.defaultConfig !== undefined) {
      definition.defaultConfig = dto.defaultConfig;
    }
    if (dto.visibility !== undefined) {
      definition.visibility = dto.visibility;
    }

    definition.currentVersion = nextVersion;
    const saved = await this.strategyDefinitionRepository.save(definition);
    await this.createDefinitionVersionSnapshot(saved, nextVersion);

    return saved;
  }

  async listStrategyDefinitionVersions(
    definitionId: string,
  ): Promise<StrategyDefinitionVersion[]> {
    await this.getStrategyDefinition(definitionId);

    return this.strategyDefinitionVersionRepository.find({
      where: { definitionId },
      order: { createdAt: 'DESC' },
    });
  }

  async setStrategyDefinitionEnabled(
    id: string,
    enabled: boolean,
  ): Promise<StrategyDefinition> {
    const definition = await this.getStrategyDefinition(id);
    definition.enabled = enabled;

    return this.strategyDefinitionRepository.save(definition);
  }

  async getStrategyInstances(runningOnly = false): Promise<
    Array<{
      id: number;
      strategyKey: string;
      strategyType: string;
      status: string;
      userId: string;
      clientId: string;
      definitionId?: string;
      definitionKey?: string;
      definitionName?: string;
      executorType?: string;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const instances = runningOnly
      ? await this.strategyService.getRunningStrategies()
      : await this.strategyService.getAllStrategies();
    const definitionIds = [...new Set(instances.map((i) => i.definitionId).filter(Boolean))] as string[];

    const definitions = definitionIds.length
      ? await this.strategyDefinitionRepository.find({
          where: { id: In(definitionIds) },
        })
      : [];
    const definitionMap = new Map(definitions.map((d) => [d.id, d]));

    return instances.map((instance) => {
      const definition = instance.definitionId
        ? definitionMap.get(instance.definitionId)
        : undefined;

      return {
        id: instance.id,
        strategyKey: instance.strategyKey,
        strategyType: instance.strategyType,
        status: instance.status,
        userId: instance.userId,
        clientId: instance.clientId,
        definitionId: instance.definitionId,
        definitionKey: definition?.key,
        definitionName: definition?.name,
        executorType: definition?.executorType,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
      };
    });
  }

  async startStrategyInstance(
    dto: StartStrategyInstanceDto,
  ): Promise<{ message: string; definitionId: string; executorType: string }> {
    const { definition, mergedConfig, strategyType } =
      await this.resolveDefinitionStartConfig(dto);

    await this.startByStrategyType(strategyType, mergedConfig);
    await this.strategyService.linkDefinitionToStrategyInstance(
      dto.userId,
      dto.clientId,
      strategyType,
      definition.id,
      definition.currentVersion || '1.0.0',
    );

    return {
      message: `Started strategy instance from definition ${definition.key}`,
      definitionId: definition.id,
      executorType: definition.executorType,
    };
  }

  async validateStrategyInstanceConfig(
    dto: StartStrategyInstanceDto,
  ): Promise<{
    valid: true;
    definitionId: string;
    definitionKey: string;
    executorType: string;
    mergedConfig: Record<string, any>;
  }> {
    const { definition, mergedConfig } = await this.resolveDefinitionStartConfig(dto);

    return {
      valid: true,
      definitionId: definition.id,
      definitionKey: definition.key,
      executorType: definition.executorType,
      mergedConfig,
    };
  }

  async stopStrategyInstance(
    dto: StopStrategyInstanceDto,
  ): Promise<{ message: string; definitionId: string; executorType: string }> {
    const definition = await this.getStrategyDefinition(dto.definitionId);
    const strategyType = this.toStrategyType(definition.executorType);

    await this.strategyService.stopStrategyForUser(
      dto.userId,
      dto.clientId,
      strategyType,
    );

    return {
      message: `Stopped strategy instance from definition ${definition.key}`,
      definitionId: definition.id,
      executorType: definition.executorType,
    };
  }

  async backfillLegacyStrategyInstanceDefinitions(): Promise<{
    updated: number;
    skipped: number;
  }> {
    const instances = await this.strategyInstanceRepository.find();
    const definitions = await this.strategyDefinitionRepository.find({
      where: { enabled: true },
    });
    const byExecutor = new Map(definitions.map((d) => [d.executorType, d]));

    let updated = 0;
    let skipped = 0;

    for (const instance of instances) {
      if (instance.definitionId) {
        skipped += 1;
        continue;
      }

      const executorType = this.mapStrategyTypeToExecutor(instance.strategyType);
      const definition = byExecutor.get(executorType);

      if (!definition) {
        skipped += 1;
        continue;
      }

      await this.strategyInstanceRepository.update(
        { id: instance.id },
        {
          definitionId: definition.id,
          definitionVersion: definition.currentVersion || '1.0.0',
          updatedAt: new Date(),
        },
      );
      updated += 1;
    }

    return { updated, skipped };
  }

  private async startByStrategyType(
    strategyType: 'arbitrage' | 'pureMarketMaking' | 'volume',
    config: Record<string, any>,
  ): Promise<void> {
    if (strategyType === 'arbitrage') {
      await this.strategyService.startArbitrageStrategyForUser(
        config as ArbitrageStrategyDto,
        config.checkIntervalSeconds,
        config.maxOpenOrders,
      );

      return;
    }

    if (strategyType === 'pureMarketMaking') {
      await this.strategyService.executePureMarketMakingStrategy(
        config as PureMarketMakingStrategyDto,
      );

      return;
    }

    await this.strategyService.executeVolumeStrategy(
      config.exchangeName,
      config.symbol,
      config.incrementPercentage,
      config.intervalTime,
      config.tradeAmount,
      config.numTrades,
      config.userId,
      config.clientId,
      config.pricePushRate,
      config.postOnlySide,
    );
  }

  private async resolveDefinitionStartConfig(
    dto: StartStrategyInstanceDto,
  ): Promise<{
    definition: StrategyDefinition;
    mergedConfig: Record<string, any>;
    strategyType: 'arbitrage' | 'pureMarketMaking' | 'volume';
  }> {
    const definition = await this.getStrategyDefinition(dto.definitionId);

    if (!definition.enabled) {
      throw new BadRequestException(
        `Strategy definition ${definition.key} is disabled`,
      );
    }

    const mergedConfig = {
      ...(definition.defaultConfig || {}),
      ...(dto.config || {}),
      userId: dto.userId,
      clientId: dto.clientId,
    } as Record<string, any>;

    this.validateConfigAgainstSchema(mergedConfig, definition.configSchema || {});

    return {
      definition,
      mergedConfig,
      strategyType: this.toStrategyType(definition.executorType),
    };
  }

  private mapStrategyTypeToExecutor(strategyType: string): string {
    if (strategyType === 'marketMaking') {
      return 'pureMarketMaking';
    }

    return strategyType;
  }

  private toStrategyType(
    executorType: string,
  ): 'arbitrage' | 'pureMarketMaking' | 'volume' {
    if (executorType === 'arbitrage') {
      return 'arbitrage';
    }
    if (executorType === 'pureMarketMaking') {
      return 'pureMarketMaking';
    }
    if (executorType === 'volume') {
      return 'volume';
    }

    throw new BadRequestException(
      `Unsupported executorType ${executorType}. Allowed: arbitrage, pureMarketMaking, volume`,
    );
  }

  private validateVersion(version: string): string {
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
      throw new BadRequestException(
        `Invalid version format ${version}. Expected semantic format x.y.z`,
      );
    }

    return version;
  }

  private incrementPatchVersion(version: string): string {
    const safeVersion = this.validateVersion(version);
    const [major, minor, patch] = safeVersion.split('.').map((n) => Number(n));

    return `${major}.${minor}.${patch + 1}`;
  }

  private async createDefinitionVersionSnapshot(
    definition: StrategyDefinition,
    version: string,
  ): Promise<void> {
    const snapshot = this.strategyDefinitionVersionRepository.create({
      definitionId: definition.id,
      version,
      executorType: definition.executorType,
      configSchema: definition.configSchema,
      defaultConfig: definition.defaultConfig,
      description: definition.description,
    });

    await this.strategyDefinitionVersionRepository.save(snapshot);
  }

  private validateConfigAgainstSchema(
    config: Record<string, any>,
    schema: Record<string, any>,
    path = '',
  ): void {
    const schemaType = schema?.type;

    if (schemaType && schemaType !== 'object') {
      throw new BadRequestException('Only object config schemas are supported');
    }

    const required = Array.isArray(schema?.required) ? schema.required : [];
    const properties =
      schema?.properties && typeof schema.properties === 'object'
        ? schema.properties
        : {};
    const additionalProperties = schema?.additionalProperties;

    for (const field of required) {
      if (config[field] === undefined || config[field] === null) {
        throw new BadRequestException(`Missing required config field: ${field}`);
      }
    }

    for (const [field, rule] of Object.entries<Record<string, any>>(properties)) {
      const fieldPath = path ? `${path}.${field}` : field;

      if (config[field] === undefined || config[field] === null) {
        continue;
      }
      const value = config[field];

      if (rule.type === 'string' && typeof value !== 'string') {
        throw new BadRequestException(`Config field ${fieldPath} must be string`);
      }
      if (rule.type === 'number' && typeof value !== 'number') {
        throw new BadRequestException(`Config field ${fieldPath} must be number`);
      }
      if (rule.type === 'boolean' && typeof value !== 'boolean') {
        throw new BadRequestException(`Config field ${fieldPath} must be boolean`);
      }
      if (rule.type === 'array' && !Array.isArray(value)) {
        throw new BadRequestException(`Config field ${fieldPath} must be array`);
      }
      if (rule.type === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) {
          throw new BadRequestException(
            `Config field ${fieldPath} must be object`,
          );
        }
        this.validateConfigAgainstSchema(value, rule, fieldPath);
      }
      if (rule.minimum !== undefined && typeof value === 'number') {
        if (value < Number(rule.minimum)) {
          throw new BadRequestException(
            `Config field ${fieldPath} must be >= ${rule.minimum}`,
          );
        }
      }
      if (Array.isArray(rule.enum) && !rule.enum.includes(value)) {
        throw new BadRequestException(
          `Config field ${fieldPath} must be one of: ${rule.enum.join(', ')}`,
        );
      }
    }

    if (additionalProperties === false) {
      const knownFields = new Set(Object.keys(properties));

      for (const field of Object.keys(config)) {
        if (!knownFields.has(field)) {
          const fieldPath = path ? `${path}.${field}` : field;
          throw new BadRequestException(
            `Config field ${fieldPath} is not allowed`,
          );
        }
      }
    }
  }

  //   async getStrategyPerformance(strategyKey: string) {
  //     return this.performanceService.getPerformanceByStrategy(strategyKey);
  //   }
}
