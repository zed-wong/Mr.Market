import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';

import '../../../../i18n/i18n';
import PnlChart from './PnlChart.svelte';

describe('PnlChart', () => {
  it('uses the empty state for no points', () => {
    const { body } = render(PnlChart, {
      props: {
        series: [],
      },
    });

    expect(body).toContain('0');
    expect(body).toContain('records');
    expect(body).toContain('No fills have settled');
  });

  it('uses the empty state for a single point instead of rendering a chart', () => {
    const { body } = render(PnlChart, {
      props: {
        series: [
          {
            t: '2026-06-08T03:31:37.391Z',
            realized: '0',
            fees: '0',
            net: '0',
          },
        ],
      },
    });

    expect(body).toContain('1');
    expect(body).toContain('records');
    expect(body).toContain('No fills have settled');
  });
});
