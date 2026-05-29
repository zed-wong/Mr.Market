import { Injectable } from '@nestjs/common';
import BigNumber from 'bignumber.js';

import { PureMarketMakingStrategyDto } from '../strategy/config/strategy.dto';
import { StrategyRuntimeSession } from '../strategy/config/strategy-controller.types';

export type KillSwitchDecision =
  | { triggered: false }
  | { triggered: true; reason: string };

@Injectable()
export class KillSwitchService {
  evaluatePureMarketMaking(
    session: StrategyRuntimeSession | undefined,
    params: PureMarketMakingStrategyDto,
  ): KillSwitchDecision {
    if (!session) {
      return { triggered: false };
    }

    const consecutiveRejects = session.consecutiveExchangeRejects || 0;
    const maxConsecutiveRejects = Number(params.maxConsecutiveRejects || 100);

    if (
      Number.isFinite(maxConsecutiveRejects) &&
      maxConsecutiveRejects > 0 &&
      consecutiveRejects >= maxConsecutiveRejects
    ) {
      return {
        triggered: true,
        reason: `${consecutiveRejects} consecutive exchange rejects (threshold ${maxConsecutiveRejects})`,
      };
    }

    const threshold = params.killSwitchThreshold;

    if (threshold === undefined || threshold === null) {
      return { triggered: false };
    }

    const realizedPnl = Number(session.realizedPnlQuote || 0);

    if (!Number.isFinite(realizedPnl)) {
      return { triggered: false };
    }

    const parsedAbsolute = this.parseAbsoluteThreshold(threshold);
    const parsedPercent = this.parsePercentThreshold(threshold);
    const tradedQuoteVolume = Number(session.tradedQuoteVolume || 0);
    const hitAbsolute =
      parsedAbsolute !== null &&
      realizedPnl <= parsedAbsolute.negated().toNumber();
    const hitPercent =
      parsedPercent !== null &&
      tradedQuoteVolume > 0 &&
      Math.abs(realizedPnl) / tradedQuoteVolume >= parsedPercent &&
      realizedPnl < 0;

    if (!hitAbsolute && !hitPercent) {
      return { triggered: false };
    }

    return {
      triggered: true,
      reason: `realizedPnl=${realizedPnl} threshold=${String(threshold)}`,
    };
  }

  private parseAbsoluteThreshold(threshold: number | string): BigNumber | null {
    if (typeof threshold === 'string' && threshold.trim().endsWith('%')) {
      return null;
    }

    const parsed = new BigNumber(threshold);

    if (!parsed.isFinite() || parsed.isLessThanOrEqualTo(0)) {
      return null;
    }

    return parsed;
  }

  private parsePercentThreshold(threshold: number | string): number | null {
    if (typeof threshold !== 'string') {
      return null;
    }

    const trimmed = threshold.trim();

    if (!trimmed.endsWith('%')) {
      return null;
    }

    const parsed = Number(trimmed.slice(0, -1));

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return null;
    }

    return parsed / 100;
  }
}
