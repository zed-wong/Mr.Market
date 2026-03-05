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
import { StrategyConfigResolverService } from '../../market-making/strategy/strategy-config-resolver.service';
import { StrategyRuntimeDispatcherService } from '../../market-making/strategy/strategy-runtime-dispatcher.service';
import { Web3Service } from '../../web3/web3.service';
import {
  GetDepositAddressDto,
  PublishStrategyDefinitionVersionDto,
  RemoveStrategyDefinitionDto,
  StartStrategyDto,
  StartStrategyInstanceDto,
  StopStrategyDto,
  StopStrategyInstanceDto,
  StrategyDefinitionDto,
  UpdateStrategyDefinitionDto,
} from './admin-strategy.dto';

@Injectable()
export class AdminStrategyService {
  constructor(
    private readonly strategyService: StrategyService,
    private readonly strategyConfigResolver: StrategyConfigResolverService,
    private readonly strategyRuntimeDispatcher: StrategyRuntimeDispatcherService,
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

    const definitionControllerType =
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
          controllerType: definitionControllerType,
          enabled: true,
        },
        order: { createdAt: 'ASC' },
      });

      if (definition) {
        const marketMakingOrderId =
          definitionControllerType === 'pureMarketMaking' && marketMakingParams
            ? marketMakingParams.marketMakingOrderId ||
              marketMakingParams.clientId
            : undefined;

        return this.startStrategyInstance({
          definitionId: definition.id,
          userId: legacyConfig.userId,
          clientId: legacyConfig.clientId,
          marketMakingOrderId,
          config: legacyConfig as Record<string, unknown>,
        });
      }
    }

    if (strategyType === 'arbitrage' && arbitrageParams) {
      await this.strategyRuntimeDispatcher.startByStrategyType('arbitrage', {
        ...arbitrageParams,
        checkIntervalSeconds: startStrategyDto.checkIntervalSeconds,
        maxOpenOrders: startStrategyDto.maxOpenOrders,
      });

      return;
    } else if (strategyType === 'marketMaking' && marketMakingParams) {
      await this.strategyRuntimeDispatcher.startByStrategyType(
        'pureMarketMaking',
        marketMakingParams,
      );

      return;
    } else if (strategyType === 'volume' && volumeParams) {
      await this.strategyRuntimeDispatcher.startByStrategyType(
        'volume',
        volumeParams as Record<string, any>,
      );

      return;
    } else {
      throw new BadRequestException('Invalid strategy parameters');
    }
  }

  async stopStrategy(stopStrategyDto: StopStrategyDto) {
    const { userId, clientId } = stopStrategyDto;
    const strategyType =
      this.strategyRuntimeDispatcher.mapStrategyTypeToController(
        stopStrategyDto.strategyType,
      );

    return this.strategyRuntimeDispatcher.stopByStrategyType(
      strategyType,
      userId,
      clientId,
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
    const controllerType = dto.controllerType || dto.executorType;

    if (!controllerType) {
      throw new BadRequestException('controllerType is required');
    }

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

    definition.name = dto.name ?? definition.name;
    definition.description = dto.description ?? definition.description;
    definition.configSchema = dto.configSchema ?? definition.configSchema;
    definition.defaultConfig = dto.defaultConfig ?? definition.defaultConfig;
    definition.visibility = dto.visibility ?? definition.visibility;
    definition.controllerType =
      dto.controllerType || dto.executorType || definition.controllerType;

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

    const existingVersion =
      await this.strategyDefinitionVersionRepository.findOne({
        where: {
          definitionId: definition.id,
          version: nextVersion,
        },
      });

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
    if (dto.controllerType !== undefined || dto.executorType !== undefined) {
      definition.controllerType = dto.controllerType || dto.executorType;
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

  async removeStrategyDefinition(dto: RemoveStrategyDefinitionDto): Promise<{
    message: string;
    definitionId: string;
  }> {
    const definition = await this.getStrategyDefinition(dto.definitionId);

    if (definition.enabled) {
      throw new BadRequestException(
        `Strategy definition ${definition.key} must be disabled before removal`,
      );
    }

    const linkedInstance = await this.strategyInstanceRepository.findOne({
      where: { definitionId: definition.id },
      order: { updatedAt: 'DESC' },
    });

    if (linkedInstance) {
      throw new BadRequestException(
        `Strategy definition ${definition.key} is linked to existing strategy instances and cannot be removed`,
      );
    }

    await this.strategyDefinitionVersionRepository.delete({
      definitionId: definition.id,
    });
    await this.strategyDefinitionRepository.delete({ id: definition.id });

    return {
      message: `Removed strategy definition ${definition.key}`,
      definitionId: definition.id,
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
      definitionId?: string;
      definitionKey?: string;
      definitionName?: string;
      controllerType?: string;
      executorType?: string;
      createdAt: Date;
      updatedAt: Date;
    }>
  > {
    const instances = runningOnly
      ? await this.strategyService.getRunningStrategies()
      : await this.strategyService.getAllStrategies();
    const definitionIds = [
      ...new Set(instances.map((i) => i.definitionId).filter(Boolean)),
    ] as string[];

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
      const controllerType = definition
        ? this.strategyConfigResolver.getDefinitionControllerType(definition)
        : undefined;

      return {
        id: instance.id,
        strategyKey: instance.strategyKey,
        strategyType: instance.strategyType,
        status: instance.status,
        userId: instance.userId,
        clientId: instance.clientId,
        marketMakingOrderId: instance.marketMakingOrderId,
        definitionId: instance.definitionId,
        definitionKey: definition?.key,
        definitionName: definition?.name,
        controllerType,
        executorType: controllerType,
        createdAt: instance.createdAt,
        updatedAt: instance.updatedAt,
      };
    });
  }

  async startStrategyInstance(dto: StartStrategyInstanceDto): Promise<{
    message: string;
    definitionId: string;
    controllerType: string;
    executorType: string;
  }> {
    const definition = await this.getStrategyDefinition(dto.definitionId);
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
      definition.currentVersion || '1.0.0',
      strategyType === 'pureMarketMaking'
        ? dto.marketMakingOrderId || dto.clientId
        : undefined,
    );

    return {
      message: `Started strategy instance from definition ${definition.key}`,
      definitionId: definition.id,
      controllerType,
      executorType: controllerType,
    };
  }

  async validateStrategyInstanceConfig(dto: StartStrategyInstanceDto): Promise<{
    valid: true;
    definitionId: string;
    definitionKey: string;
    controllerType: string;
    executorType: string;
    mergedConfig: Record<string, any>;
  }> {
    const definition = await this.getStrategyDefinition(dto.definitionId);
    const { mergedConfig } =
      this.strategyConfigResolver.resolveDefinitionStartConfig(definition, dto);
    const controllerType =
      this.strategyConfigResolver.getDefinitionControllerType(definition);

    return {
      valid: true,
      definitionId: definition.id,
      definitionKey: definition.key,
      controllerType,
      executorType: controllerType,
      mergedConfig,
    };
  }

  async stopStrategyInstance(dto: StopStrategyInstanceDto): Promise<{
    message: string;
    definitionId: string;
    controllerType: string;
    executorType: string;
  }> {
    const definition = await this.getStrategyDefinition(dto.definitionId);
    const controllerType =
      this.strategyConfigResolver.getDefinitionControllerType(definition);
    const strategyType =
      this.strategyRuntimeDispatcher.toStrategyType(controllerType);

    await this.strategyRuntimeDispatcher.stopByStrategyType(
      strategyType,
      dto.userId,
      dto.marketMakingOrderId || dto.clientId,
    );

    return {
      message: `Stopped strategy instance from definition ${definition.key}`,
      definitionId: definition.id,
      controllerType,
      executorType: controllerType,
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
    const byController = new Map(
      definitions.map((d) => [
        this.strategyConfigResolver.getDefinitionControllerType(d),
        d,
      ]),
    );

    let updated = 0;
    let skipped = 0;

    for (const instance of instances) {
      if (instance.definitionId) {
        skipped += 1;
        continue;
      }

      const controllerType =
        this.strategyRuntimeDispatcher.mapStrategyTypeToController(
          instance.strategyType,
        );
      const definition = byController.get(controllerType);

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
      controllerType:
        this.strategyConfigResolver.getDefinitionControllerType(definition),
      configSchema: definition.configSchema,
      defaultConfig: definition.defaultConfig,
      description: definition.description,
    });

    await this.strategyDefinitionVersionRepository.save(snapshot);
  }

  //   async getStrategyPerformance(strategyKey: string) {
  //     return this.performanceService.getPerformanceByStrategy(strategyKey);
  //   }
}
