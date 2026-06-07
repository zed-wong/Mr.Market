import { render } from 'svelte/server';
import { addMessages, init } from 'svelte-i18n';
import { describe, expect, it } from 'vitest';

import en from '../../../i18n/en.json';
import AnalyticsChartCard from './components/AnalyticsChartCard.svelte';
import AnalyticsMetricCard from './components/AnalyticsMetricCard.svelte';
import type { ChartSectionView, MetricCardView } from './analytics-view-model';

addMessages('en', en);
init({ fallbackLocale: 'en', initialLocale: 'en' });

describe('analytics rendered components', () => {
  it('renders unavailable chart sections as an empty state instead of a false zero chart', () => {
    const section: ChartSectionView = {
      key: 'pnl',
      titleKey: 'admin_analytics_chart_pnl_series',
      summary: '0 points · net PNL series',
      points: [],
      valueLabelKey: 'admin_analytics_metric_net_pnl',
      status: 'unavailable',
      unavailableReason: 'chart-values-unavailable',
    };

    const { body } = render(AnalyticsChartCard, { props: { section } });

    expect(body).toContain('chart-values-unavailable');
    expect(body).toContain('unavailable');
    expect(body).not.toContain('>0<');
  });

  it('renders unavailable metric cards with unavailable copy instead of a zero value', () => {
    const card: MetricCardView = {
      key: 'unrealizedPnl',
      labelKey: 'admin_analytics_metric_unrealized_pnl',
      displayValue: 'unavailable',
      currency: 'USDT',
      caption: '',
      status: 'unavailable',
      reason: 'order-book-mid-unavailable',
    };

    const { body } = render(AnalyticsMetricCard, { props: { card } });

    expect(body).toContain('unavailable');
    expect(body).toContain('order-book-mid-unavailable');
    expect(body).not.toContain('>0<');
  });
});
