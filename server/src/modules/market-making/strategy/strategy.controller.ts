// strategy.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';
import { StrategyService } from 'src/modules/market-making/strategy/strategy.service';

import { AdminStrategyService } from '../../admin/strategy/adminStrategy.service';
import {
  ArbitrageStrategyDto,
  ExecuteVolumeStrategyDto,
  JoinStrategyDto,
  PureMarketMakingStrategyDto,
  StopIndicatorStrategyDto,
  StopVolumeStrategyDto,
} from './strategy.dto';
import { TimeIndicatorStrategyService } from './time-indicator.service';
import { TimeIndicatorStrategyDto } from './timeIndicator.dto';

@ApiTags('Trading Engine')
@Controller('strategy')
export class StrategyController {
  private readonly logger = new Logger(StrategyController.name);
  constructor(
    private readonly strategyService: StrategyService,
    private readonly adminService: AdminStrategyService,
    private readonly timeIndicatorStrategyService: TimeIndicatorStrategyService,
  ) {}

  @Get('running')
  @ApiOperation({ summary: 'Get all running strategies' })
  @ApiResponse({
    status: 200,
    description: 'A list of all currently running strategies',
    type: [StrategyInstance],
  })
  async getRunningStrategies(): Promise<StrategyInstance[]> {
    return await this.strategyService.getRunningStrategies();
  }

  @Get('all-strategies')
  @ApiOperation({ summary: 'Get all strategies' })
  @ApiResponse({
    status: 200,
    description: 'A list of all strategies, including running and stopped ones',
    type: [StrategyInstance],
  })
  async getAllStrategies(): Promise<StrategyInstance[]> {
    return await this.strategyService.getAllStrategies();
  }

  @Post('join')
  @ApiOperation({ summary: 'Join a strategy with a contribution' })
  @ApiBody({
    description: 'Data required to join a strategy',
    type: JoinStrategyDto,
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully joined the strategy',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request or strategy parameters',
  })
  async joinStrategy(@Body() joinStrategyDto: JoinStrategyDto) {
    const {
      userId,
      clientId,
      strategyKey,
      amount,
      transactionHash,
      tokenSymbol,
      chainId,
      tokenAddress,
    } = joinStrategyDto;

    return this.adminService.joinStrategy(
      userId,
      clientId,
      strategyKey,
      amount,
      transactionHash,
      tokenSymbol,
      chainId,
      tokenAddress,
    );
  }

  @Post('/execute-arbitrage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute arbitrage strategy for a user' })
  @ApiResponse({
    status: 200,
    description: 'The arbitrage strategy has been initiated for the user.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async executeArbitrage(@Body() strategyParamsDto: ArbitrageStrategyDto) {
    return this.strategyService.startArbitrageStrategyForUser(
      strategyParamsDto,
      strategyParamsDto.checkIntervalSeconds,
      strategyParamsDto.maxOpenOrders,
    );
  }

  @Get('/stop-arbitrage')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop arbitrage strategy for a user' })
  @ApiQuery({ name: 'userId', type: String, description: 'User ID' })
  @ApiQuery({ name: 'clientId', type: String, description: 'Client ID' })
  @ApiResponse({
    status: 200,
    description: 'The arbitrage strategy has been stopped for the user.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async stopArbitrage(
    @Query('userId') userId: string,
    @Query('clientId') clientId: string,
  ) {
    return await this.strategyService.stopStrategyForUser(
      userId,
      clientId,
      'arbitrage',
    );
  }

  @Post('/execute-pure-market-making')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute pure market making strategy for a user' })
  @ApiResponse({
    status: 200,
    description:
      'The pure market making strategy has been initiated for the user. An optional oracle exchange can be specified to fetch pricing from a different source.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async executePureMarketMaking(
    @Body() strategyParamsDto: PureMarketMakingStrategyDto,
  ) {
    // Passing the entire DTO to the service
    return this.strategyService.executePureMarketMakingStrategy(
      strategyParamsDto,
    );
  }

  @Get('/stop-marketmaking')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop pure market making strategy for a user' })
  @ApiQuery({ name: 'userId', type: String, description: 'User ID' })
  @ApiQuery({ name: 'clientId', type: String, description: 'Client ID' })
  @ApiResponse({
    status: 200,
    description:
      'The pure market making strategy has been stopped for the user.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async stopPureMarketMaking(
    @Query('userId') userId: string,
    @Query('clientId') clientId: string,
  ) {
    // This assumes you have a method in StrategyService to stop strategies by type
    return this.strategyService.stopStrategyForUser(
      userId,
      clientId,
      'pureMarketMaking',
    );
  }

  @Post('/execute-volume-strategy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Execute volume strategy',
    description: `Starts a volume trading strategy between two accounts on the same exchange. 
      This strategy can randomly vary the trade amount, push the price upward by a specified rate after 
      each trade, and ensure that orders execute by placing a limit order at the current best bid/ask 
      and immediately placing a matching order from the other account.`,
  })
  @ApiResponse({
    status: 200,
    description:
      'The volume strategy has been started and will ensure execution of trades.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async executeVolumeStrategy(
    @Body() executeVolumeStrategyDto: ExecuteVolumeStrategyDto,
  ) {
    const {
      exchangeName,
      symbol,
      incrementPercentage,
      intervalTime,
      tradeAmount,
      numTrades,
      userId,
      clientId,
      pricePushRate,
      postOnlySide,
    } = executeVolumeStrategyDto;

    return this.strategyService.executeVolumeStrategy(
      exchangeName,
      symbol,
      incrementPercentage,
      intervalTime,
      tradeAmount,
      numTrades,
      userId,
      clientId,
      pricePushRate,
      postOnlySide,
    );
  }

  @Post('/stop-volume-strategy')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop volume strategy' })
  @ApiResponse({
    status: 200,
    description: 'The volume strategy has been stopped.',
  })
  @ApiResponse({ status: 400, description: 'Bad request.' })
  async stopVolumeStrategy(
    @Body() stopVolumeStrategyDto: StopVolumeStrategyDto,
  ) {
    return this.strategyService.stopVolumeStrategy(
      stopVolumeStrategyDto.userId,
      stopVolumeStrategyDto.clientId,
    );
  }

  @Post('execute-indicator-strategy')
  @ApiOperation({ summary: 'Run the time-indicator strategy once (stateless)' })
  async execute(@Body() dto: TimeIndicatorStrategyDto) {
    return this.timeIndicatorStrategyService.executeIndicatorStrategy(dto);
  }

  @Post('start-indicator-strategy')
  @ApiOperation({
    summary: 'Start periodic execution of the time-indicator strategy',
  })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async start(@Body() dto: TimeIndicatorStrategyDto) {
    if (
      !Number.isFinite(dto.tickIntervalMs) ||
      !Number.isInteger(dto.tickIntervalMs) ||
      dto.tickIntervalMs <= 0
    ) {
      throw new BadRequestException(
        'tickIntervalMs must be a finite positive integer',
      );
    }
    this.logger.warn(
      'Time-indicator run state is in-memory only; use persistent strategy state for multi-instance/restart safety.',
    );

    return await this.timeIndicatorStrategyService.startIndicatorStrategy(dto);
  }

  @Post('stop-indicator-strategy')
  @ApiOperation({
    summary: 'Stop periodic execution of the time-indicator strategy',
  })
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  async stop(@Body() dto: StopIndicatorStrategyDto) {
    this.logger.warn(
      'Stop indicator strategy should consult persisted run state in multi-instance deployments; current implementation is in-memory.',
    );

    return await this.timeIndicatorStrategyService.stopIndicatorStrategy(
      dto.userId,
      dto.clientId,
    );
  }

  @Post('rerun')
  @ApiOperation({ summary: 'Rerun a saved strategy instance' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        strategyKey: {
          type: 'string',
          description: 'The unique key of the strategy instance to rerun',
          example: 'user123-client123-pureMarketMaking',
        },
      },
      required: ['strategyKey'],
    },
  })
  async rerunStrategy(@Body('strategyKey') strategyKey: string) {
    return await this.strategyService.rerunStrategy(strategyKey);
  }
}
