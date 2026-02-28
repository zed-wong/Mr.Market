import { BigNumber } from 'ethers';

export function priceFromSqrtX96(
  sqrtPriceX96: BigNumber,
  token0Decimals: number,
  token1Decimals: number,
): string {
  const TWO_96 = BigNumber.from(2).pow(96);
  const num = sqrtPriceX96.mul(sqrtPriceX96);
  const base = num.mul(BigNumber.from(10).pow(token0Decimals));
  const denom = TWO_96.mul(TWO_96).mul(BigNumber.from(10).pow(token1Decimals));
  const SCALE = 18;
  const scaled = base.mul(BigNumber.from(10).pow(SCALE)).div(denom);

  if (scaled.isZero()) {
    return '0';
  }

  const scaledStr = scaled.toString().padStart(SCALE + 1, '0');
  const intPart = scaledStr.slice(0, -SCALE);
  const fracPart = scaledStr.slice(-SCALE).replace(/0+$/, '');

  return fracPart ? `${intPart}.${fracPart}` : intPart;
}

export function pctToBps(pct: number) {
  if (!Number.isFinite(pct)) {
    throw new TypeError(`pctToBps expects a finite number, got: ${pct}`);
  }

  const bps = Math.round(pct * 100);

  if (!Number.isFinite(bps)) {
    throw new TypeError(`pctToBps produced non-finite bps for pct: ${pct}`);
  }

  return bps;
}

export function clampJitter(base: number, jitterPct: number) {
  if (!Number.isFinite(base)) {
    throw new TypeError(`clampJitter expects finite base, got: ${base}`);
  }
  if (!Number.isFinite(jitterPct)) {
    throw new TypeError(
      `clampJitter expects finite jitterPct, got: ${jitterPct}`,
    );
  }

  const jitterPctClamped = Math.min(Math.max(jitterPct, 0), 100);
  const r = (Math.random() * 2 - 1) * (jitterPctClamped / 100);
  const computedPrice = base * (1 + r);

  if (!Number.isFinite(computedPrice)) {
    throw new TypeError(
      `clampJitter produced non-finite value for base=${base}, jitterPct=${jitterPct}`,
    );
  }

  return Math.max(0, computedPrice);
}
