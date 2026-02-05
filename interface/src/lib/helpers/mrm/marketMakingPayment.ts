import BigNumber from "bignumber.js";
import { getUuid } from "@mixin.dev/mixin-node-sdk";
import {
  createMixinInvoice,
  getPaymentUrl,
  type InvoiceItem,
} from "$lib/helpers/mixin/mixin-invoice";
import {
  createMarketMakingOrderIntent,
  type MarketMakingFee,
} from "$lib/helpers/mrm/grow";
import { getMarketMakingPaymentState } from "$lib/helpers/mrm/strategy";
import type { MarketMakingPair } from "$lib/types/hufi/grow";
import {
  ORDER_STATE_FETCH_INTERVAL,
  ORDER_STATE_TIMEOUT_DURATION,
} from "$lib/helpers/constants";

export type MarketMakingPaymentInput = {
  selectedPairInfo: MarketMakingPair;
  feeInfo: MarketMakingFee;
  baseAmount: string;
  quoteAmount: string;
  botId: string;
  userId?: string;
};

export type MarketMakingPaymentResult = {
  orderId: string;
  paymentUrl: string | null;
};

export const createMarketMakingPayment = async (
  params: MarketMakingPaymentInput,
): Promise<MarketMakingPaymentResult | null> => {
  const { selectedPairInfo, feeInfo, baseAmount, quoteAmount, botId, userId } =
    params;

  if (!selectedPairInfo || !feeInfo || !baseAmount || !quoteAmount || !botId) {
    return null;
  }

  const intent = await createMarketMakingOrderIntent({
    marketMakingPairId: selectedPairInfo.id,
    userId,
  });

  if (!intent?.memo || !intent?.orderId) {
    console.error("Failed to create market making order intent");
    return null;
  }

  const itemsMap = new Map<string, BigNumber>();
  const itemMemo = new Map<string, string>();
  const memo = intent.memo;

  const addItem = (assetId: string | null, amount: string) => {
    if (!assetId || !amount || parseFloat(amount) <= 0) return;
    const existingAmount = itemsMap.get(assetId) || new BigNumber(0);
    itemsMap.set(assetId, existingAmount.plus(amount));
    if (!itemMemo.has(assetId)) {
      itemMemo.set(assetId, memo);
    }
  };

  const baseMarketMakingFee = feeInfo.market_making_fee_percentage
    ? BigNumber(baseAmount)
        .multipliedBy(feeInfo.market_making_fee_percentage)
        .toString()
    : "0";
  const quoteMarketMakingFee = feeInfo.market_making_fee_percentage
    ? BigNumber(quoteAmount)
        .multipliedBy(feeInfo.market_making_fee_percentage)
        .toString()
    : "0";

  addItem(selectedPairInfo.base_asset_id, baseAmount);
  addItem(selectedPairInfo.quote_asset_id, quoteAmount);

  if (feeInfo.base_fee_amount && parseFloat(feeInfo.base_fee_amount) > 0) {
    addItem(feeInfo.base_fee_id, feeInfo.base_fee_amount);
  }

  if (feeInfo.quote_fee_amount && parseFloat(feeInfo.quote_fee_amount) > 0) {
    addItem(feeInfo.quote_fee_id, feeInfo.quote_fee_amount);
  }

  if (baseMarketMakingFee && parseFloat(baseMarketMakingFee) > 0) {
    addItem(selectedPairInfo.base_asset_id, baseMarketMakingFee);
  }

  if (quoteMarketMakingFee && parseFloat(quoteMarketMakingFee) > 0) {
    addItem(selectedPairInfo.quote_asset_id, quoteMarketMakingFee);
  }

  const items: InvoiceItem[] = Array.from(itemsMap.entries()).map(
    ([assetId, amount]) => ({
      assetId,
      amount: amount.toString(),
      extra: itemMemo.get(assetId) || memo,
      traceId: getUuid(),
    }),
  );

  if (items.length === 0) {
    console.error("No invoice items for market making payment");
    return null;
  }

  const invoiceMin = createMixinInvoice(botId, items);
  const paymentUrl = invoiceMin ? getPaymentUrl(invoiceMin) : null;

  return {
    orderId: intent.orderId,
    paymentUrl,
  };
};

export type MarketMakingPaymentState = {
  state: "pending" | "success" | "timeout";
};

export type MarketMakingPaymentPollerOptions = {
  isActive?: () => boolean;
  onPending?: (orderId: string) => void;
  onSuccess?: (orderId: string) => void;
  onTimeout?: (orderId: string) => void;
  onError?: (error: unknown) => void;
  processingDurationMs?: number;
};

export const createMarketMakingPaymentPoller = (
  options: MarketMakingPaymentPollerOptions = {},
) => {
  const paymentPollers = new Map<
    string,
    { timeoutId: ReturnType<typeof setTimeout>; startedAt: number }
  >();
  const paymentResults = new Map<string, MarketMakingPaymentState>();
  const paymentTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  const isActive = options.isActive ?? (() => true);
  const processingDurationMs = options.processingDurationMs ?? 15000;

  const stopPaymentPolling = (orderId: string) => {
    const poller = paymentPollers.get(orderId);
    if (poller) {
      clearTimeout(poller.timeoutId);
      paymentPollers.delete(orderId);
    }
  };

  const stopPaymentTimeout = (orderId: string) => {
    const timeout = paymentTimeouts.get(orderId);
    if (timeout) {
      clearTimeout(timeout);
      paymentTimeouts.delete(orderId);
    }
  };

  const stopAll = () => {
    for (const orderId of Array.from(paymentPollers.keys())) {
      stopPaymentPolling(orderId);
    }
    for (const orderId of Array.from(paymentTimeouts.keys())) {
      stopPaymentTimeout(orderId);
    }
  };

  const startPaymentTimeout = (orderId: string) => {
    stopPaymentTimeout(orderId);
    const timeoutId = setTimeout(() => {
      paymentResults.set(orderId, { state: "timeout" });
      if (isActive()) {
        options.onTimeout?.(orderId);
      }
      stopPaymentPolling(orderId);
    }, processingDurationMs);
    paymentTimeouts.set(orderId, timeoutId);
  };

  const schedulePaymentPoll = (orderId: string, startedAt: number) => {
    const timeoutId = setTimeout(async () => {
      try {
        if (!isActive()) {
          stopPaymentPolling(orderId);
          return;
        }

        if (Date.now() - startedAt > ORDER_STATE_TIMEOUT_DURATION) {
          paymentResults.set(orderId, { state: "timeout" });
          options.onTimeout?.(orderId);
          stopPaymentPolling(orderId);
          return;
        }

        const res = await getMarketMakingPaymentState(orderId);
        if (res?.data?.state === "payment_complete") {
          paymentResults.set(orderId, { state: "success" });
          if (isActive()) {
            options.onSuccess?.(orderId);
          }
          stopPaymentPolling(orderId);
          stopPaymentTimeout(orderId);
          return;
        }

        schedulePaymentPoll(orderId, startedAt);
      } catch (error) {
        console.error("Error polling payment state:", error);
        options.onError?.(error);
        schedulePaymentPoll(orderId, startedAt);
      }
    }, ORDER_STATE_FETCH_INTERVAL);

    paymentPollers.set(orderId, { timeoutId, startedAt });
  };

  const start = (orderId: string) => {
    paymentResults.set(orderId, { state: "pending" });
    options.onPending?.(orderId);
    startPaymentTimeout(orderId);
    schedulePaymentPoll(orderId, Date.now());
  };

  return {
    paymentResults,
    start,
    stopAll,
    stopPaymentPolling,
    stopPaymentTimeout,
  };
};
