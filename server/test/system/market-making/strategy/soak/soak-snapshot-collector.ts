export type ResourceSnapshot = {
  tick: number;
  heapUsedMb: number;
  trackedOrderMapSize: number;
  processedIntentIdsSize: number;
  executorSessionCount: number;
  intentDbRowCount: number;
  mappingDbRowCount: number;
  historyDbRowCount: number;
  orphanedFillCount: number;
};

export function linearSlope(values: number[]): number {
  const n = values.length;

  if (n < 2) {
    return 0;
  }

  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i++) {
    numerator += (i - xMean) * (values[i] - yMean);
    denominator += (i - xMean) ** 2;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}
