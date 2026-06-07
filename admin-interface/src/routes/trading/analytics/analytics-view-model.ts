import BigNumber from 'bignumber.js';
import type {
  AdminAnalyticsFoundationResponse,
  AnalyticsRange,
  AnalyticsScope,
  AnalyticsTimelineEvent,
  DecimalMetric,
  DirectMarketMakingDashboardResponse,
  InventorySkewMetric,
  PerOrderAnalytics,
  PnlSeriesPoint,
  RatioMetric,
} from '$lib/types/hufi/admin-analytics';

export type AnalyticsPanelState = 'loading' | 'error' | 'empty' | 'ready';

export interface AnalyticsRouteQuery {
  scope: AnalyticsScope;
  range: AnalyticsRange;
  orderId?: string;
  exchange?: string;
  pair?: string;
}

export interface MetricCardView {
  key: string;
  labelKey: string;
  displayValue: string;
  currency: string;
  caption: string;
  status: 'available' | 'unavailable';
  reason: string;
}

export interface ChartSectionView {
  key: 'pnl' | 'inventory' | 'drawdown' | 'timeline';
  titleKey: string;
  summary: string;
  points: Array<{ index: number; label: string; value: number; realized?: number; fees?: number }>;
  valueLabelKey: string;
  status: 'available' | 'unavailable';
  unavailableReason: string;
  events?: AnalyticsTimelineEvent[];
}

const unavailable = 'unavailable';
const chartValuesUnavailable = 'chart-values-unavailable';

const toDecimal = (value: string | number | null | undefined) => {
  const decimal = new BigNumber(value ?? '');

  return decimal.isFinite() ? decimal : null;
};

const formatDecimal = (value: string | number | null | undefined, options: Intl.NumberFormatOptions = {}) => {
  const decimal = toDecimal(value);

  if (!decimal) {
    return unavailable;
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 8,
    ...options,
  }).format(decimal.toNumber());
};

const metricValue = (metric: DecimalMetric | RatioMetric) => {
  if (metric.status === 'unavailable' || metric.value === null) {
    return unavailable;
  }

  return formatDecimal(metric.value);
};

const percentValue = (metric: RatioMetric) => {
  if (metric.status === 'unavailable' || metric.value === null) {
    return unavailable;
  }

  const decimal = toDecimal(metric.value);

  if (!decimal) {
    return unavailable;
  }

  return `${formatDecimal(decimal.multipliedBy(100).toFixed(), {
    maximumFractionDigits: 2,
  })}%`;
};

const metricCaption = (metric: DecimalMetric | RatioMetric) => {
  if ('filledQuotes' in metric && 'totalQuotes' in metric) {
    return `${metric.filledQuotes ?? 0} / ${metric.totalQuotes ?? 0} quotes`;
  }

  if ('activeMs' in metric && 'windowMs' in metric) {
    return `${formatDecimal(metric.activeMs ?? 0, { maximumFractionDigits: 0 })} / ${formatDecimal(metric.windowMs ?? 0, { maximumFractionDigits: 0 })} ms`;
  }

  return metric.currency || '';
};

const card = (
  key: string,
  labelKey: string,
  metric: DecimalMetric | RatioMetric,
  options: { percent?: boolean; caption?: string } = {},
): MetricCardView => ({
  key,
  labelKey,
  displayValue: options.percent ? percentValue(metric as RatioMetric) : metricValue(metric),
  currency: metric.currency || '',
  caption: options.caption ?? metricCaption(metric),
  status: metric.status,
  reason: metric.unavailableReason || '',
});

const inventorySkewCaption = (metric: InventorySkewMetric) => {
  if (metric.quantity) {
    return `${metric.quantity.value ?? unavailable} ${metric.quantity.currency ?? ''}`.trim();
  }

  if (metric.quantityByAsset && metric.quantityByAsset.length > 0) {
    return metric.quantityByAsset
      .map((row) => `${formatDecimal(row.quantity)} ${row.asset}`)
      .join(' · ');
  }

  return metric.unavailableReason || '';
};

export const buildDirectMarketMakingMetricCards = (
  response: DirectMarketMakingDashboardResponse | null,
): MetricCardView[] => {
  if (!response) {
    return [];
  }

  const metrics = response.dashboard.costRevenue;

  return [
    card('spreadCapture', 'admin_analytics_metric_spread_capture', metrics.spreadCapture),
    card('feeCost', 'admin_analytics_metric_fee_cost', metrics.feeCost),
    card('inventorySkew', 'admin_analytics_metric_inventory_skew', metrics.inventorySkew.notional, {
      caption: inventorySkewCaption(metrics.inventorySkew),
    }),
    card('realizedPnl', 'admin_analytics_metric_realized_pnl', metrics.realizedPnl),
    card('unrealizedPnl', 'admin_analytics_metric_unrealized_pnl', metrics.unrealizedPnl),
    card('fillRate', 'admin_analytics_metric_fill_rate', metrics.fillRate, { percent: true }),
    card('quoteUptime', 'admin_analytics_metric_quote_uptime', metrics.quoteUptime, { percent: true }),
  ];
};

const pointValue = (value: string | number | null | undefined) => {
  const decimal = toDecimal(value);

  return decimal ? decimal.toNumber() : null;
};

const timelineSummary = (events: AnalyticsTimelineEvent[]) => {
  const counts = events.reduce<Record<string, number>>((accumulator, event) => {
    accumulator[event.type] = (accumulator[event.type] || 0) + 1;

    return accumulator;
  }, {});

  return `${events.length} events · ${counts.quote || 0} quote · ${counts.fill || 0} fill · ${counts.cancel || 0} cancel`;
};

const buildPnlSection = (series: PnlSeriesPoint[]): ChartSectionView => {
  const points = series.flatMap((point, index) => {
    const value = pointValue(point.net);

    if (value === null) {
      return [];
    }

    return [
      {
        index,
        label: point.t,
        value,
        realized: pointValue(point.realized) ?? undefined,
        fees: pointValue(point.fees) ?? undefined,
      },
    ];
  });

  return {
    key: 'pnl',
    titleKey: 'admin_analytics_chart_pnl_series',
    summary: `${points.length} points · net PNL series`,
    points,
    valueLabelKey: 'admin_analytics_metric_net_pnl',
    status: points.length > 0 ? 'available' : 'unavailable',
    unavailableReason: points.length > 0 ? '' : series.length > 0 ? chartValuesUnavailable : 'pnl-series-empty',
  };
};

const buildInventorySection = (
  foundation: AdminAnalyticsFoundationResponse,
  perOrder: PerOrderAnalytics | null,
): ChartSectionView => {
  const aggregate = foundation.analytics.aggregate;
  const rows = aggregate?.inventoryExposure.quantityByAsset ?? [];
  const notional = perOrder?.inventoryExposure.notional ?? aggregate?.inventoryExposure.notional;
  const points =
    rows.length > 0
      ? rows.flatMap((row, index) => {
          const value = pointValue(row.quantity);

          return value === null
            ? []
            : [
                {
                  index,
                  label: row.asset,
                  value,
                },
              ];
        })
      : (() => {
          const value = pointValue(perOrder?.inventoryExposure.quantity.value);

          return value === null
            ? []
            : [
                {
                  index: 0,
                  label: perOrder?.baseAsset || 'inventory',
                  value,
                },
              ];
        })();
  const notionalSummary =
    notional?.status === 'unavailable'
      ? `notional ${unavailable}: ${notional.unavailableReason}`
      : `notional ${formatDecimal(notional?.value)} ${notional?.currency || ''}`.trim();

  return {
    key: 'inventory',
    titleKey: 'admin_analytics_chart_inventory_exposure',
    summary: notionalSummary,
    points,
    valueLabelKey: 'admin_analytics_metric_inventory_skew',
    status: points.length > 0 && notional?.status === 'available' ? 'available' : 'unavailable',
    unavailableReason: notional?.unavailableReason || (points.length > 0 ? '' : chartValuesUnavailable),
  };
};

const buildDrawdownSection = (series: PnlSeriesPoint[], maxDrawdownQuote?: string | null): ChartSectionView => {
  const points = series.flatMap((point, index) => {
    const value = pointValue(point.net);

    return value === null
      ? []
      : [
          {
            index,
            label: point.t,
            value: Math.abs(value),
          },
        ];
  });

  return {
    key: 'drawdown',
    titleKey: 'admin_analytics_chart_drawdown_risk',
    summary: `${points.length} points · max drawdown ${formatDecimal(maxDrawdownQuote)}`,
    points,
    valueLabelKey: 'admin_analytics_metric_drawdown',
    status: points.length > 0 ? 'available' : 'unavailable',
    unavailableReason: points.length > 0 ? '' : series.length > 0 ? chartValuesUnavailable : 'drawdown-series-empty',
  };
};

export const buildAnalyticsChartSections = (
  foundation: AdminAnalyticsFoundationResponse | null,
): ChartSectionView[] => {
  if (!foundation) {
    return [];
  }

  const perOrder = foundation.analytics.perOrder;
  const aggregate = foundation.analytics.aggregate;
  const pnlSeries = aggregate?.pnlSeries ?? perOrder?.drawdown.series ?? [];
  const drawdown = aggregate?.drawdown ?? perOrder?.drawdown;
  const timelineEvents = perOrder?.timeline.events ?? [];

  return [
    buildPnlSection(pnlSeries),
    buildInventorySection(foundation, perOrder),
    buildDrawdownSection(drawdown?.series ?? [], drawdown?.maxDrawdownQuote),
    {
      key: 'timeline',
      titleKey: 'admin_analytics_chart_timeline',
      summary:
        timelineEvents.length > 0
          ? timelineSummary(timelineEvents)
          : 'select an order scope to render quote, fill, and cancel timeline rows',
      points: timelineEvents.map((event, index) => ({
        index,
        label: event.at || event.id,
        value: index + 1,
      })),
      valueLabelKey: 'admin_analytics_timeline_events',
      status: timelineEvents.length > 0 ? 'available' : 'unavailable',
      unavailableReason: timelineEvents.length > 0 ? '' : 'timeline-empty-or-aggregate-scope',
      events: timelineEvents,
    },
  ];
};

export const resolveAnalyticsPanelState = (input: {
  loading: boolean;
  error: string | null;
  foundation: AdminAnalyticsFoundationResponse | null;
  dashboard: DirectMarketMakingDashboardResponse | null;
}): AnalyticsPanelState => {
  if (input.loading) {
    return 'loading';
  }

  if (input.error) {
    return 'error';
  }

  const cards = buildDirectMarketMakingMetricCards(input.dashboard);
  const sections = buildAnalyticsChartSections(input.foundation);
  const hasMetricData = cards.some((metric) => metric.status === 'available');
  const hasChartData = sections.some((section) => section.status === 'available' && section.points.length > 0);
  const orderIds = input.dashboard?.dashboard.orderIds ?? [];

  if ((!hasMetricData && !hasChartData) || (orderIds.length === 0 && !hasChartData)) {
    return 'empty';
  }

  return 'ready';
};

export const buildAnalyticsRequestKey = (query: AnalyticsRouteQuery) =>
  JSON.stringify({
    scope: query.scope,
    range: query.range,
    orderId: query.orderId?.trim() || '',
    exchange: query.exchange?.trim().toLowerCase() || '',
    pair: query.pair?.trim().toUpperCase() || '',
  });

export const analyticsQueriesMatch = (left: AnalyticsRouteQuery, right: AnalyticsRouteQuery) =>
  buildAnalyticsRequestKey(left) === buildAnalyticsRequestKey(right);

export const buildAnalyticsScopeLabel = (
  query: AnalyticsRouteQuery,
  labels: { admin: string; pair: string; order: string },
) => {
  if (query.scope === 'order') {
    return query.orderId?.trim() || labels.order;
  }

  if (query.scope === 'pair') {
    return [query.exchange?.trim(), query.pair?.trim()].filter(Boolean).join(' ') || labels.pair;
  }

  return labels.admin;
};
