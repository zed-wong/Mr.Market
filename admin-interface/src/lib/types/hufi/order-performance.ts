export interface OrderPerformancePoint {
  t: string;
  realized: string;
  fees: string;
  net: string;
}

export interface OrderPerformanceSummary {
  realizedPnlQuote: string;
  feesQuote: string;
  netPnlQuote: string;
  tradedQuoteVolume: string;
  effectiveSpreadBps: string | null;
  fillCount: number;
  otherFees: Array<{ assetId: string; amount: string }>;
}

export interface OrderPerformance {
  series: OrderPerformancePoint[];
  summary: OrderPerformanceSummary;
  reconciliation?: {
    realizedPnlMatchesStored: boolean;
    storedRealizedPnlQuote?: string;
  };
}
