import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StrategyInstance } from 'src/common/entities/market-making/strategy-instances.entity';

import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { StrategyService } from './strategy.service';

@ApiTags('Trading Engine')
@Controller('strategy')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StrategyController {
  constructor(private readonly strategyService: StrategyService) {}

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

  @Get('controllers')
  @ApiOperation({
    summary: 'Get available runtime strategy controller types',
  })
  @ApiResponse({
    status: 200,
    description: 'List of supported controller types',
    schema: {
      type: 'object',
      properties: {
        controllers: {
          type: 'array',
          items: { type: 'string' },
          example: ['arbitrage', 'pureMarketMaking', 'volume'],
        },
      },
    },
  })
  getSupportedControllers() {
    return { controllers: this.strategyService.getSupportedControllerTypes() };
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
          example: 'order-123-pureMarketMaking',
        },
      },
      required: ['strategyKey'],
    },
  })
  async rerunStrategy(@Body('strategyKey') strategyKey: string) {
    return await this.strategyService.rerunStrategy(strategyKey);
  }
}
