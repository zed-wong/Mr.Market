import { Injectable } from '@nestjs/common';
import {
  EvmExecution,
  EvmExecutionType,
} from 'src/common/entities/market-making/evm-execution.entity';

import {
  CreateEvmExecutionCommand,
} from './evm-execution.service';
import { NonceAllocatorService } from './nonce-allocator.service';

export type EvmChildExecutionType = Extract<
  EvmExecutionType,
  'approve' | 'wrap' | 'unwrap'
>;

export type PlanChildExecutionsCommand = Omit<
  CreateEvmExecutionCommand,
  'executionType' | 'nonce'
> & {
  parentExecutionId: string;
  childTypes: EvmChildExecutionType[];
};

@Injectable()
export class EvmChildExecutionPlannerService {
  constructor(private readonly nonceAllocatorService: NonceAllocatorService) {}

  async preAllocateChildren(
    command: PlanChildExecutionsCommand,
  ): Promise<EvmExecution[]> {
    const executions: EvmExecution[] = [];

    for (const executionType of command.childTypes) {
      executions.push(
        await this.nonceAllocatorService.preAllocate({
          ...command,
          executionType,
        }),
      );
    }

    return executions;
  }
}
