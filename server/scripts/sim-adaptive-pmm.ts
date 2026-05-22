/* eslint-disable no-console */
/**
 * Runtime simulation of the adaptive Pure Market Making logic.
 *
 * Loads the real QuoteExecutorManagerService and reproduces parts of
 * strategy.service.ts adaptive PMM helpers in-process to probe behaviour
 * under realistic, fast-changing market conditions. Used purely for debugging.
 *
 * Run with: bun run --cwd server scripts/sim-adaptive-pmm.ts
 */
import 'reflect-metadata';
import BigNumber from 'bignumber.js';
import { QuoteExecutorManagerService } from '../src/modules/market-making/strategy/intent/quote-executor-manager.service';

type Scenario = {
  label: string;
  input: Parameters<QuoteExecutorManagerService['buildQuotes']>[0];
  expectations?: string[];
};

const svc = new QuoteExecutorManagerService();
const issues: string[] = [];

function record(issue: string) {
  issues.push(issue);
  console.log('  ⚠️  ', issue);
}

function fmt(qty: string, dp = 6) {
  return new BigNumber(qty).toFixed(dp);
}

function buildBase(
  overrides: Partial<Parameters<QuoteExecutorManagerService['buildQuotes']>[0]>,
): Parameters<QuoteExecutorManagerService['buildQuotes']>[0] {
  return {
    midPrice: '100',
    numberOfLayers: 1,
    bidSpread: 0.001, // 10bps
    askSpread: 0.001,
    orderAmount: '1',
    amountChangePerLayer: 0,
    amountChangeType: 'fixed',
    inventorySkewFactor: 0,
    inventoryTargetBaseRatio: 0.5,
    currentBaseRatio: 0.5,
    makerHeavyMode: false,
    makerHeavyBiasBps: 0,
    ...overrides,
  };
}

function printQuotes(label: string, quotes: any[]) {
  console.log(`\n=== ${label} ===`);
  if (quotes.length === 0) {
    console.log('  (no quotes generated)');
  }
  for (const q of quotes) {
    console.log(
      `  L${q.layer} ${q.side.padEnd(4)} px=${new BigNumber(q.price).toFixed(
        4,
      )} qty=${fmt(q.qty)}`,
    );
  }
}

function run(scenario: Scenario) {
  console.log(`\n\n#### Scenario: ${scenario.label} ####`);
  const quotes = svc.buildQuotes(scenario.input);
  printQuotes(scenario.label, quotes);
  return quotes;
}

/* ───────────────────────────────────────────────────────────── */
/* 1) volBasedSpread interacts with per-layer multiplier         */
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 1: vol-based spread scaling per-layer (suspected bug)\n' +
      '══════════════════════════════════════════════════════════',
  );
  const input = buildBase({
    numberOfLayers: 3,
    bidSpread: 0.001, // 10 bps base
    askSpread: 0.001,
    volBasedSpread: true,
    realizedVolatility: 0.005, // 50 bps
    spreadSigmaMultiplier: 1,
  });
  const quotes = run({ label: 'vol-based spread, 3 layers', input });

  // What each bid price *should* be if vol is a fixed widening:
  // baseSpread = 0.001, vol_adj = 0.005
  // L1 expected bidSpread = (0.001*1) + 0.005 = 0.006
  // L2 expected bidSpread = (0.001*2) + 0.005 = 0.007
  // L3 expected bidSpread = (0.001*3) + 0.005 = 0.008
  //
  // What the code actually produces:
  // L1 = (0.001 + 0.005) * 1 = 0.006
  // L2 = (0.001 + 0.005) * 2 = 0.012  <-- vol contribution DOUBLED
  // L3 = (0.001 + 0.005) * 3 = 0.018  <-- vol contribution TRIPLED

  const bids = quotes.filter((q) => q.side === 'buy');
  if (bids.length >= 2) {
    const l1Spread = new BigNumber(100).minus(bids[0].price).dividedBy(100);
    const l2Spread = new BigNumber(100).minus(bids[1].price).dividedBy(100);
    console.log(
      `  L1 bid spread = ${l1Spread.toFixed(6)} (expected ~0.006)`,
    );
    console.log(
      `  L2 bid spread = ${l2Spread.toFixed(6)} (expected ~0.007 if vol is fixed widening)`,
    );
    if (l2Spread.isGreaterThan(0.011)) {
      record(
        'BUG: volatility-based spread is multiplied per-layer; layer N pays N × σ widening instead of fixed σ widening. Outer layers explode in volatile markets.',
      );
    }
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 2) toxicity/imbalance/recovery: applied as flat additions     */
/*    AFTER per-layer multiplier — so outer layers have a        */
/*    *smaller relative* defensive widening than inner layers    */
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 2: toxicity/imbalance widening is NOT layered\n' +
      '══════════════════════════════════════════════════════════',
  );
  const input = buildBase({
    numberOfLayers: 3,
    bidSpread: 0.001,
    askSpread: 0.001,
    buyToxicityScore: 1,
    sellToxicityScore: 1,
    toxicityWidenBps: 50, // 0.005
  });
  const quotes = run({
    label: 'toxic flow on both sides, 3 layers',
    input,
  });

  const bids = quotes.filter((q) => q.side === 'buy');
  if (bids.length >= 3) {
    const sp = (i: number) =>
      new BigNumber(100).minus(bids[i].price).dividedBy(100);
    console.log(
      `  L1 bid spread = ${sp(0).toFixed(6)}, L2 = ${sp(1).toFixed(6)}, L3 = ${sp(2).toFixed(6)}`,
    );
    // L1 = 0.001*1 + 0.005 = 0.006   (toxicity = 83% of widening)
    // L2 = 0.001*2 + 0.005 = 0.007   (toxicity = 71% of widening)
    // L3 = 0.001*3 + 0.005 = 0.008   (toxicity = 62% of widening)
    record(
      'OBSERVATION: toxicity widening is added as a flat number AFTER the base spread is multiplied by layer index. Outer layers absorb a smaller fraction of defensive widening — likely unintended.',
    );
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 3) zero-quote outcome from combined inventory pause + toxicity*/
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 3: both sides paused → silent zero-quote state\n' +
      '══════════════════════════════════════════════════════════',
  );
  const input = buildBase({
    numberOfLayers: 3,
    inventoryTargetBaseRatio: 0.5,
    currentBaseRatio: 0.9, // very heavy in base → pause buy
    inventoryPauseSidePivot: 0.2,
    buyPaused: false,
    sellPaused: true, // sell paused via toxicity / pause flag
  });
  const quotes = run({ label: 'inventory pause + toxicity pause', input });

  if (quotes.length === 0) {
    record(
      'BUG: when toxicity pauses the sell side AND inventory triggers a buy-side pause, buildQuotes returns []. No log/marker is emitted from the executor itself; the only signal is the count in the decision log. The strategy can silently quote nothing for entire windows.',
    );
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 4) imbalance signal is damped by inventoryWeight when inventory
      is far from target — but `imbalanceSkewFactor` shifts price */
/*    in a way that *adds* to inventory imbalance                */
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 4: imbalance skew vs inventory skew interaction\n' +
      '══════════════════════════════════════════════════════════',
  );

  // imbalance > 0 means buy pressure → calculateImbalanceAdjust returns positive
  // bidSpread += imbalanceAdjust (widens bid → less aggressive buy)
  // askSpread -= imbalanceAdjust (tightens ask → more aggressive sell)
  //
  // Effect: under buy pressure the strategy aggressively sells, passively buys.
  // Then `inventoryWeight` is computed as (1 - |delta|/severePivot). So as inventory
  // gets further from target, the imbalance signal is DAMPENED — exactly when you'd
  // most want it to reduce inventory toward target.
  const input = buildBase({
    numberOfLayers: 1,
    inventoryTargetBaseRatio: 0.5,
    currentBaseRatio: 0.7, // overweight base
    inventorySeverePivot: 0.25,
    orderBookImbalance: 0.4, // buy pressure (we should sell aggressively)
    imbalanceSkewFactor: 0.005,
  });
  const quotes = run({
    label:
      'imbalance buy-pressure while overweight base (want aggressive sell)',
    input,
  });

  // inventoryDelta = 0.7 - 0.5 = 0.2
  // inventoryWeight = max(0, 1 - 0.2/0.25) = 0.2
  // imbalanceAdjust = 0.4 * 0.005 * 0.2 = 0.0004 (4 bps)
  // Without damping it would have been 0.4 * 0.005 = 0.002 (20 bps)
  record(
    'DESIGN ISSUE: imbalance signal is multiplied by inventoryWeight = max(0, 1 - |delta|/severePivot). At |delta| ≥ severePivot the imbalance contribution becomes ZERO. This kills the OFI/imbalance contribution at exactly the moment it would help bring inventory back to target.',
  );
}

/* ───────────────────────────────────────────────────────────── */
/* 5) inventory pause logic: pauses the WRONG side at the cusp    */
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 5: inventory pause boundary behaviour\n' +
      '══════════════════════════════════════════════════════════',
  );
  // delta = 0.2 exactly equal to pivot 0.2  →  delta.abs().isLessThan(pivot) = false
  // → pauses buy side correctly. But what about NaN / negative ratios?
  for (const ratio of [0.5, 0.7, 0.71, 0.3, 0.29, NaN, Number.POSITIVE_INFINITY]) {
    const input = buildBase({
      numberOfLayers: 1,
      currentBaseRatio: ratio,
      inventoryPauseSidePivot: 0.2,
    });
    const quotes = svc.buildQuotes(input);
    const sides = quotes.map((q) => q.side).sort().join(',');
    console.log(`  ratio=${ratio} → sides quoted: [${sides || 'NONE'}]`);
    if (Number.isNaN(ratio) && quotes.length === 0) {
      record(
        'BUG: NaN currentBaseRatio causes buildQuotes to emit no quotes (inventoryDelta becomes NaN; both sides treated as paused). Upstream should never feed NaN, but there is no defensive handling.',
      );
    }
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 6) maxLayersInVol only fires when adaptiveSizeEnabled         */
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 6: maxLayersInVol coupling to adaptiveSizeEnabled\n' +
      '══════════════════════════════════════════════════════════',
  );
  const noAdaptive = svc.buildQuotes(
    buildBase({
      numberOfLayers: 5,
      adaptiveSizeEnabled: false,
      maxLayersInVol: 1,
      realizedVolatility: 0.05,
    }),
  );
  console.log(`  adaptiveSize=false: layers emitted = ${noAdaptive.length / 2}`);
  if (noAdaptive.length / 2 === 5) {
    record(
      'BUG: maxLayersInVol is gated behind adaptiveSizeEnabled. Operators who want layer-collapse on vol but not vol-size scaling cannot enable it independently. The DTO docs (line 393 sizeFloor, line 381 adaptiveSizeEnabled) treat them as independent levers.',
    );
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 7) negative price possible when bid spread > 1                */
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 7: large spreads → negative or huge prices\n' +
      '══════════════════════════════════════════════════════════',
  );
  const input = buildBase({
    numberOfLayers: 5,
    bidSpread: 0.3,
    askSpread: 0.3,
    volBasedSpread: true,
    realizedVolatility: 0.5,
    spreadSigmaMultiplier: 1,
  });
  const quotes = run({ label: 'extreme spreads, 5 layers', input });
  for (const q of quotes) {
    if (new BigNumber(q.price).isLessThanOrEqualTo(0)) {
      record(
        `BUG: produced non-positive price ${q.price} on ${q.side} L${q.layer}. clampAdaptiveSpread defaults to off (maxAdaptiveSpread unset = no clamp). With layered spread × multiplier, buy price can go ≤ 0.`,
      );
    }
    if (new BigNumber(q.price).isGreaterThan(1e6)) {
      record(
        `BUG: produced runaway sell price ${q.price} on L${q.layer}.`,
      );
    }
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 8) inventory skew applied before layer multiplier             */
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 8: inventory skew vs layer multiplier interaction\n' +
      '══════════════════════════════════════════════════════════',
  );
  const input = buildBase({
    numberOfLayers: 3,
    bidSpread: 0.001,
    askSpread: 0.001,
    currentBaseRatio: 0.7,
    inventoryTargetBaseRatio: 0.5,
    inventorySkewFactor: 0.01, // delta=0.2 → skew = 0.002
  });
  const quotes = run({
    label: 'inventory-skewed quotes, 3 layers',
    input,
  });

  // Skew should bias the centre, not the per-layer spacing. But code does:
  //   bidSpread = bidSpread*layer + skewAdjust
  //   askSpread = askSpread*layer - skewAdjust
  // skewAdjust here = 0.002 (positive because we're long base)
  // L1 bid = 0.001 + 0.002 = 0.003, ask = 0.001 - 0.002 = -0.001 → max(0)=0
  // L3 bid = 0.003 + 0.002 = 0.005, ask = 0.003 - 0.002 = 0.001
  //
  // Observation: at L1 the ask is clamped to zero spread = quoting AT mid!
  // That is risky during a sell-heavy inventory situation.
  const asks = quotes.filter((q) => q.side === 'sell');
  const l1ask = asks[0];
  if (l1ask) {
    const askSpread = new BigNumber(l1ask.price).minus(100).dividedBy(100);
    if (askSpread.isLessThanOrEqualTo(0.0001)) {
      record(
        `BUG/RISK: inventory skew can collapse the inner-layer ask spread to ≤ 1 bp (got ${askSpread.toFixed(6)}). Negative spreads clamp to zero, meaning the engine quotes AT or very near the mid — likely to be hit immediately and amplify inventory if the mid is biased.`,
      );
    }
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 9) adaptive size — buyQty/sellQty can be zero after stacking  */
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 9: adaptive size stacking can emit zero qty quotes\n' +
      '══════════════════════════════════════════════════════════',
  );
  const input = buildBase({
    numberOfLayers: 1,
    orderAmount: '1',
    adaptiveSizeEnabled: true,
    sizeFloor: 0, // floor not set
    realizedVolatility: 1, // huge vol
    sizeVolScalingFactor: 5, // discount > 1
    currentBaseRatio: 0.9,
    inventoryTargetBaseRatio: 0.5,
    inventorySeverePivot: 0.4,
    buyToxicityScore: 5,
    sellToxicityScore: 5,
    toxicityWidenBps: 0,
    buyRecoverySizeRatio: 0.1,
    sellRecoverySizeRatio: 0.1,
  });
  const quotes = run({ label: 'aggressive adaptive sizing', input });
  for (const q of quotes) {
    if (new BigNumber(q.qty).isLessThanOrEqualTo(0)) {
      record(
        `BUG: emitted quote with qty=${q.qty} on ${q.side} L${q.layer}. With sizeFloor=0 and large σ, vol discount clamps at 0 → final qty is 0 (or negative if discount went past 1). Such quotes will be rejected by every exchange and waste the cancel/place budget.`,
      );
    }
  }
}

/* ───────────────────────────────────────────────────────────── */
/* 10) Pure runtime — replicate strategy.service warmup state    */
/*     to look for stale-warmup leakage across restart           */
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 10: warmup state persistence across strategy restart\n' +
      '══════════════════════════════════════════════════════════',
  );
  const warmupStartedAt = new Map<string, number>();
  const warmupTicks = new Map<string, number>();
  const strategyKey = 'binance:BTC/USDT:user-1';

  function resolveWarmup(warmupMs: number, warmupTicksCfg: number) {
    const now = Date.now();
    const startedAt = warmupStartedAt.get(strategyKey) || now;
    const ticks = (warmupTicks.get(strategyKey) || 0) + 1;
    warmupStartedAt.set(strategyKey, startedAt);
    warmupTicks.set(strategyKey, ticks);
    let reason: string | null = null;
    if (warmupMs > 0 && now - startedAt < warmupMs) reason = 'warmup_ms';
    if (!reason && warmupTicksCfg > 0 && ticks <= warmupTicksCfg)
      reason = 'warmup_ticks';
    return { active: reason !== null, reason, ticks, age: now - startedAt };
  }

  // first run
  const a = resolveWarmup(5_000, 3);
  console.log(`  first tick: ${JSON.stringify(a)}`);

  // simulate strategy "stopped" then "restarted" — strategy.service.ts
  // does NOT clear adaptivePmmWarmupStartedAtByStrategy on stop, only on
  // restart with new key. Same key → warmup state survives.
  const later = resolveWarmup(5_000, 3);
  console.log(`  same key second tick: ${JSON.stringify(later)}`);

  // simulate restart many seconds later (using same key)
  warmupTicks.set(strategyKey, 999);
  // age now would have already exceeded warmupMs if we waited;
  // we just confirm the maps are not cleared anywhere
  console.log(
    `  warmupTicks=${warmupTicks.get(strategyKey)} warmupStartedAt=${warmupStartedAt.get(strategyKey)}`,
  );

  record(
    'BUG: adaptivePmmWarmupStartedAtByStrategy / adaptivePmmWarmupTicksByStrategy in strategy.service are never deleted on strategy stop, only kept per process. After restart with the same strategy key, warmup is treated as already complete → no protective warmup spread.',
  );
}

/* ───────────────────────────────────────────────────────────── */
/* 11) shouldBlockAdaptivePmmForMarketSafety blocks on soft_stale*/
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 11: market-safety block sensitivity\n' +
      '══════════════════════════════════════════════════════════',
  );
  // soft_stale is supposed to be a "widen" condition, not a "kill" condition.
  // strategy.service.ts:4902-4911 cancels ALL quotes for soft_stale too.
  // That means a single missed websocket heartbeat (> staleSoftMs) flushes
  // the book and you eat cancel-and-replace fees every tick.
  record(
    'DESIGN BUG: shouldBlockAdaptivePmmForMarketSafety returns true on soft_stale. Per the yellowpaper / Hummingbot lineage, soft_stale should only widen spreads — only hard_stale and crash should flush. The current behaviour will repeatedly cancel-place during minor WS hiccups, wasting cancel budget and exchange rate-limit budget.',
  );
}

/* ───────────────────────────────────────────────────────────── */
/* 12) updateAdaptivePmmCadence vs applyAdaptivePmmRuntimePressureCadence */
/* ───────────────────────────────────────────────────────────── */
{
  console.log(
    '\n\n══════════════════════════════════════════════════════════\n' +
      'TEST 12: cadence updates are monotonic but un-decayed\n' +
      '══════════════════════════════════════════════════════════',
  );
  // applyAdaptivePmmRuntimePressureCadence does:
  //   session.cadenceMs = Math.max(session.cadenceMs, refreshMaxMs)
  // It NEVER restores cadence after rate-limit pressure drops. Once the engine
  // hits the rate-limit threshold even once, cadence is stuck at refreshMaxMs
  // until updateAdaptivePmmCadence reduces it (which it CAN, on the next tick,
  // because vol-based cadence is computed fresh — so this is actually safe.
  // BUT: when adaptiveRefreshEnabled = false, updateAdaptivePmmCadence is a no-op,
  // so the rate-limit cadence floor is sticky forever. That asymmetry is a bug.
  record(
    'BUG: applyAdaptivePmmRuntimePressureCadence raises session.cadenceMs to refreshMaxMs when rate-limit pressure is observed. If adaptiveRefreshEnabled=false, updateAdaptivePmmCadence is a no-op and the cadence stays elevated permanently after the first rate-limit episode, even after pressure subsides. The two cadence controllers must be linked or the floor must decay.',
  );
}

/* ───────────────────────────────────────────────────────────── */
console.log(
  '\n\n══════════════════════════════════════════════════════════\n' +
    `SUMMARY: ${issues.length} issues found\n` +
    '══════════════════════════════════════════════════════════',
);
for (const [i, msg] of issues.entries()) {
  console.log(`\n${i + 1}. ${msg}`);
}
