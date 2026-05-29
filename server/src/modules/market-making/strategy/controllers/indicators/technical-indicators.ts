export function calcEma(series: number[], period: number): number[] {
  if (period <= 0) return series.map(() => NaN);

  const k = 2 / (period + 1);
  const result: number[] = [];
  let previous: number | undefined;

  for (let index = 0; index < series.length; index += 1) {
    const value = series[index];

    if (index === 0 || previous === undefined) {
      previous = value;
      result.push(value);
    } else {
      const ema = (value - previous) * k + previous;

      result.push(ema);
      previous = ema;
    }
  }

  return result;
}

export function calcRsi(series: number[], period: number): number[] {
  if (period <= 0 || series.length < period + 1) {
    return new Array(series.length).fill(NaN);
  }

  const gains: number[] = [];
  const losses: number[] = [];

  for (let index = 1; index < series.length; index += 1) {
    const delta = series[index] - series[index - 1];

    gains.push(Math.max(delta, 0));
    losses.push(Math.max(-delta, 0));
  }

  let avgGain = avg(gains.slice(0, period));
  let avgLoss = avg(losses.slice(0, period));
  const values = new Array(series.length).fill(NaN);

  for (let index = period - 1; index < gains.length; index += 1) {
    if (index >= period) {
      avgGain = (avgGain * (period - 1) + gains[index]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[index]) / period;
    }
    const rs = avgLoss === 0 ? Number.POSITIVE_INFINITY : avgGain / avgLoss;

    values[index + 1] = 100 - 100 / (1 + rs);
  }

  return values;
}

export function avg(values: number[]): number {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function calcCross(
  prevFast: number,
  prevSlow: number,
  fast: number,
  slow: number,
): 'CROSS_UP' | 'CROSS_DOWN' | 'NONE' {
  if (prevFast <= prevSlow && fast > slow) {
    return 'CROSS_UP';
  }
  if (prevFast >= prevSlow && fast < slow) {
    return 'CROSS_DOWN';
  }

  return 'NONE';
}

export function safePct(value?: number): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}
