import {
  TARDING_TYPE_MAP,
  SPOT_ORDER_TYPE_MAP,
  SPOT_EXCHANGE_MAP,
} from 'src/common/constants/memo';
import {
  ExchangeIndexValue,
  MemoDetails,
  SpotOrderTypeValue,
  TradingTypeValue,
} from 'src/common/types/memo/memo';
import { PairsMapKey } from 'src/common/types/pairs/pairs';

export const decodeSpotMemo = (decodedMemo: string): MemoDetails => {
  // Decode decoded base64
  if (!decodedMemo) {
    return null;
  }
  // Split memo string into parts
  const parts = decodedMemo.split(':');
  const [
    tradingType,
    spotOrderType,
    exchange,
    destId,
    limitPriceOrRefId,
    refId,
  ] = parts;

  return {
    tradingType: TARDING_TYPE_MAP[tradingType] as TradingTypeValue,
    spotOrderType: SPOT_ORDER_TYPE_MAP[spotOrderType] as SpotOrderTypeValue,
    exchangeName: SPOT_EXCHANGE_MAP[exchange] as ExchangeIndexValue,
    destId: destId as PairsMapKey,
    limitPrice: parts.length === 6 ? limitPriceOrRefId : undefined,
    refId: parts.length === 6 ? refId : undefined,
  };
};

export const decodeSwapMemo = () => {};