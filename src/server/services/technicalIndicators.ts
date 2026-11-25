import type { OhlcvBar } from './marketDataService.ts';

export interface IndicatorPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sma20: number | null;
  sma50: number | null;
  sma100: number | null;
  sma200: number | null;
  ema12: number | null;
  ema20: number | null;
  ema26: number | null;
  ema50: number | null;
  vwap: number | null;
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  bbUpper: number | null;
  bbMiddle: number | null;
  bbLower: number | null;
  obv: number;
}

export interface FibonacciLevels {
  swingHigh: number;
  swingLow: number;
  lookbackBars: number;
  direction: 'Uptrend Retracement' | 'Downtrend Retracement';
  levels: Array<{ ratio: string; price: number }>;
}

export interface PivotPointLevels {
  basisDate: string;
  pivot: number;
  r1: number;
  r2: number;
  r3: number;
  s1: number;
  s2: number;
  s3: number;
}

export interface AtrRiskLevels {
  atr14: number;
  stopLoss15x: number;
  stopLoss2x: number;
  target2x: number;
  target3x: number;
  riskRewardRatio: number;
}

export interface PriceActionAnalysis {
  distanceToSma20Pct: number | null;
  distanceToSma50Pct: number | null;
  distanceToSma200Pct: number | null;
  distanceToNearestSupportPct: number | null;
  distanceToNearestResistancePct: number | null;
  rangePositionPct: number | null;
  recent5dReturnPct: number | null;
  recent20dReturnPct: number | null;
  structureLabel: string;
}

export interface BreakoutLevels {
  rangeHigh20: number;
  rangeLow20: number;
  bullishBreakout: number;
  bearishBreakdown: number;
  status: 'Breakout Above 20D High' | 'Breakdown Below 20D Low' | 'Inside 20D Range';
}

export interface TechnicalSummary {
  latestClose: number;
  sma20: number | null;
  sma50: number | null;
  sma100: number | null;
  sma200: number | null;
  ema12: number | null;
  ema20: number | null;
  ema26: number | null;
  ema50: number | null;
  vwap: number | null;
  momentum10dPct: number | null;
  rsi14: number | null;
  rsiState: 'Overbought' | 'Oversold' | 'Neutral';
  macd: {
    line: number | null;
    signal: number | null;
    histogram: number | null;
    bias: 'Bullish Crossover' | 'Bearish Crossover' | 'Neutral';
  };
  bollinger: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    percentB: number | null;
  };
  atr14: number | null;
  adx14: number | null;
  plusDI14: number | null;
  minusDI14: number | null;
  trendStrength: 'Strong Trend' | 'Moderate Trend' | 'Weak / Ranging' | 'Unavailable';
  stochRsi: {
    k: number | null;
    d: number | null;
    state: 'Overbought' | 'Oversold' | 'Neutral';
  };
  cci20: number | null;
  cciState: 'Overbought' | 'Oversold' | 'Neutral';
  obv: number;
  obvTrend: 'Accumulation' | 'Distribution' | 'Neutral';
  fibonacci: FibonacciLevels | null;
  pivotPoints: PivotPointLevels | null;
  breakoutLevels: BreakoutLevels;
  priceAction: PriceActionAnalysis;
  volumeAnalysis: {
    latestVolume: number;
    avgVolume20: number;
    volumeRatio: number;
    state: 'High Activity' | 'Normal' | 'Low Activity';
  };
  supportLevels: number[];
  resistanceLevels: number[];
  trend: 'Uptrend' | 'Downtrend' | 'Sideways';
  annualizedVolatilityPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
  sortinoRatio: number | null;
  downsideDeviationPct: number | null;
  var95DailyPct: number | null;
  liquidityRisk: 'Low' | 'Moderate' | 'High';
  atrRiskLevels: AtrRiskLevels | null;
}

export function calcSMA(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) {
      out[i] = Number((sum / period).toFixed(2));
    }
  }
  return out;
}

export function calcEMA(values: number[], period: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i];
  let prev = seed / period;
  out[period - 1] = Number(prev.toFixed(2));
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = Number(prev.toFixed(2));
  }
  return out;
}

export function calcRollingVWAP(bars: OhlcvBar[], window = 20): Array<number | null> {
  const out: Array<number | null> = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    const start = Math.max(0, i - window + 1);
    let pvSum = 0;
    let volSum = 0;
    for (let j = start; j <= i; j++) {
      const typical = (bars[j].high + bars[j].low + bars[j].close) / 3;
      const v = Math.max(0, bars[j].volume);
      pvSum += typical * v;
      volSum += v;
    }
    if (volSum > 0) {
      out[i] = Number((pvSum / volSum).toFixed(2));
    }
  }
  return out;
}

export function calcRSI(closes: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : Number((100 - 100 / (1 + avgGain / avgLoss)).toFixed(2));
  }
  return out;
}

export function calcStochRSI(
  rsiSeries: Array<number | null>,
  period = 14
): { k: number | null; d: number | null; state: 'Overbought' | 'Oversold' | 'Neutral' } {
  const validRsi = rsiSeries.filter((v): v is number => v !== null);
  if (validRsi.length < period + 3) {
    return { k: null, d: null, state: 'Neutral' };
  }
  const stochValues: number[] = [];
  for (let i = period - 1; i < validRsi.length; i++) {
    const slice = validRsi.slice(i - period + 1, i + 1);
    const minR = Math.min(...slice);
    const maxR = Math.max(...slice);
    const raw = maxR - minR > 1e-6 ? ((validRsi[i] - minR) / (maxR - minR)) * 100 : 50;
    stochValues.push(raw);
  }
  if (stochValues.length < 3) return { k: null, d: null, state: 'Neutral' };

  // 3-period SMA for %K and 3-period SMA of %K for %D
  const kSeries: number[] = [];
  for (let i = 2; i < stochValues.length; i++) {
    kSeries.push((stochValues[i] + stochValues[i - 1] + stochValues[i - 2]) / 3);
  }
  const latestK = Number(kSeries[kSeries.length - 1].toFixed(2));
  const latestD =
    kSeries.length >= 3
      ? Number(
          (
            (kSeries[kSeries.length - 1] +
              kSeries[kSeries.length - 2] +
              kSeries[kSeries.length - 3]) /
            3
          ).toFixed(2)
        )
      : latestK;

  const state: 'Overbought' | 'Oversold' | 'Neutral' =
    latestK >= 80 ? 'Overbought' : latestK <= 20 ? 'Oversold' : 'Neutral';

  return { k: latestK, d: latestD, state };
}

export function calcCCI(bars: OhlcvBar[], period = 20): number | null {
  if (bars.length < period) return null;
  const recent = bars.slice(-period);
  const tps = recent.map((b) => (b.high + b.low + b.close) / 3);
  const meanTp = tps.reduce((a, b) => a + b, 0) / period;
  const meanDev = tps.reduce((acc, v) => acc + Math.abs(v - meanTp), 0) / period;
  if (meanDev <= 1e-9) return 0;
  const latestTp = tps[tps.length - 1];
  return Number(((latestTp - meanTp) / (0.015 * meanDev)).toFixed(2));
}

export function calcADX(
  bars: OhlcvBar[],
  period = 14
): { adx14: number | null; plusDI14: number | null; minusDI14: number | null } {
  if (bars.length < period * 2 + 2) {
    return { adx14: null, plusDI14: null, minusDI14: null };
  }

  const trList: number[] = [];
  const plusDmList: number[] = [];
  const minusDmList: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const cur = bars[i];
    const prev = bars[i - 1];
    const upMove = cur.high - prev.high;
    const downMove = prev.low - cur.low;
    const plusDm = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDm = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      cur.high - cur.low,
      Math.abs(cur.high - prev.close),
      Math.abs(cur.low - prev.close)
    );
    trList.push(tr);
    plusDmList.push(plusDm);
    minusDmList.push(minusDm);
  }

  let smoothTr = trList.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothPlus = plusDmList.slice(0, period).reduce((a, b) => a + b, 0);
  let smoothMinus = minusDmList.slice(0, period).reduce((a, b) => a + b, 0);

  const dxValues: number[] = [];
  let lastPlusDI = 0;
  let lastMinusDI = 0;

  for (let i = period; i < trList.length; i++) {
    smoothTr = smoothTr - smoothTr / period + trList[i];
    smoothPlus = smoothPlus - smoothPlus / period + plusDmList[i];
    smoothMinus = smoothMinus - smoothMinus / period + minusDmList[i];

    const plusDI = smoothTr > 1e-9 ? (smoothPlus / smoothTr) * 100 : 0;
    const minusDI = smoothTr > 1e-9 ? (smoothMinus / smoothTr) * 100 : 0;
    const sumDI = plusDI + minusDI;
    const dx = sumDI > 1e-9 ? (Math.abs(plusDI - minusDI) / sumDI) * 100 : 0;
    dxValues.push(dx);
    lastPlusDI = plusDI;
    lastMinusDI = minusDI;
  }

  if (dxValues.length < period) {
    return { adx14: null, plusDI14: null, minusDI14: null };
  }

  let adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dxValues.length; i++) {
    adx = (adx * (period - 1) + dxValues[i]) / period;
  }

  return {
    adx14: Number(adx.toFixed(2)),
    plusDI14: Number(lastPlusDI.toFixed(2)),
    minusDI14: Number(lastMinusDI.toFixed(2)),
  };
}

export function calcOBV(bars: OhlcvBar[]): {
  series: number[];
  latest: number;
  trend: 'Accumulation' | 'Distribution' | 'Neutral';
} {
  const series: number[] = [];
  let running = 0;
  for (let i = 0; i < bars.length; i++) {
    if (i > 0) {
      if (bars[i].close > bars[i - 1].close) running += bars[i].volume;
      else if (bars[i].close < bars[i - 1].close) running -= bars[i].volume;
    }
    series.push(Math.round(running));
  }
  const latest = series[series.length - 1] ?? 0;
  const lookbackIdx = Math.max(0, series.length - 21);
  const prev = series[lookbackIdx] ?? 0;
  const delta = latest - prev;
  const avgVol =
    bars.slice(-20).reduce((s, b) => s + b.volume, 0) / Math.max(1, Math.min(20, bars.length));
  const threshold = avgVol * 1.5;
  const trend: 'Accumulation' | 'Distribution' | 'Neutral' =
    delta > threshold ? 'Accumulation' : delta < -threshold ? 'Distribution' : 'Neutral';

  return { series, latest, trend };
}

export function calcMACD(closes: number[]) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine: Array<number | null> = closes.map((_, i) =>
    ema12[i] !== null && ema26[i] !== null
      ? Number(((ema12[i] as number) - (ema26[i] as number)).toFixed(3))
      : null
  );

  const validMacdValues: number[] = [];
  const validIndices: number[] = [];
  macdLine.forEach((v, idx) => {
    if (v !== null) {
      validMacdValues.push(v);
      validIndices.push(idx);
    }
  });

  const rawSignal = calcEMA(validMacdValues, 9);
  const signalLine: Array<number | null> = new Array(closes.length).fill(null);
  const histogram: Array<number | null> = new Array(closes.length).fill(null);

  rawSignal.forEach((sig, i) => {
    const targetIdx = validIndices[i];
    if (sig !== null) {
      signalLine[targetIdx] = Number(sig.toFixed(3));
      const m = macdLine[targetIdx];
      if (m !== null) {
        histogram[targetIdx] = Number((m - sig).toFixed(3));
      }
    }
  });

  return { macdLine, signalLine, histogram };
}

export function calcBollingerBands(closes: number[], period = 20, stdMult = 2) {
  const middle = calcSMA(closes, period);
  const upper: Array<number | null> = new Array(closes.length).fill(null);
  const lower: Array<number | null> = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const mean = middle[i];
    if (mean === null) continue;
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - mean;
      sumSq += diff * diff;
    }
    const std = Math.sqrt(sumSq / period);
    upper[i] = Number((mean + stdMult * std).toFixed(2));
    lower[i] = Number((mean - stdMult * std).toFixed(2));
  }

  return { upper, middle, lower };
}

export function calcATR(bars: OhlcvBar[], period = 14): number | null {
  if (bars.length <= period) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const prevC = bars[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC)));
  }
  const recent = trs.slice(-period);
  const atr = recent.reduce((a, b) => a + b, 0) / recent.length;
  return Number(atr.toFixed(2));
}

export function calcFibonacciRetracement(bars: OhlcvBar[], lookback = 120): FibonacciLevels | null {
  const window = bars.slice(-Math.min(bars.length, lookback));
  if (window.length < 20) return null;

  let high = -Infinity;
  let low = Infinity;
  let highIdx = 0;
  let lowIdx = 0;
  window.forEach((b, idx) => {
    if (b.high > high) {
      high = b.high;
      highIdx = idx;
    }
    if (b.low < low) {
      low = b.low;
      lowIdx = idx;
    }
  });

  const diff = high - low;
  if (diff <= 0) return null;

  const isUptrendSwing = highIdx >= lowIdx;
  const ratios = [0.236, 0.382, 0.5, 0.618, 0.786];
  const levels = ratios.map((r) => ({
    ratio: `${(r * 100).toFixed(1)}%`,
    price: Number((isUptrendSwing ? high - diff * r : low + diff * r).toFixed(2)),
  }));

  return {
    swingHigh: Number(high.toFixed(2)),
    swingLow: Number(low.toFixed(2)),
    lookbackBars: window.length,
    direction: isUptrendSwing ? 'Uptrend Retracement' : 'Downtrend Retracement',
    levels,
  };
}

export function calcClassicPivotPoints(bars: OhlcvBar[]): PivotPointLevels | null {
  if (bars.length < 2) return null;
  // Use the prior completed session for classic daily floor pivots
  const prev = bars[bars.length - 2];
  const p = (prev.high + prev.low + prev.close) / 3;
  const range = prev.high - prev.low;
  return {
    basisDate: prev.date,
    pivot: Number(p.toFixed(2)),
    r1: Number((2 * p - prev.low).toFixed(2)),
    r2: Number((p + range).toFixed(2)),
    r3: Number((prev.high + 2 * (p - prev.low)).toFixed(2)),
    s1: Number((2 * p - prev.high).toFixed(2)),
    s2: Number((p - range).toFixed(2)),
    s3: Number((prev.low - 2 * (prev.high - p)).toFixed(2)),
  };
}

export function calcPearsonCorrelation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 10) return null;
  const sliceA = a.slice(-n);
  const sliceB = b.slice(-n);
  const meanA = sliceA.reduce((s, v) => s + v, 0) / n;
  const meanB = sliceB.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i++) {
    const da = sliceA[i] - meanA;
    const db = sliceB[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  if (denom <= 1e-12) return null;
  return Number((cov / denom).toFixed(2));
}

export function calcBeta(assetReturns: number[], benchmarkReturns: number[]): number | null {
  const n = Math.min(assetReturns.length, benchmarkReturns.length);
  if (n < 15) return null;
  const a = assetReturns.slice(-n);
  const m = benchmarkReturns.slice(-n);
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanM = m.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varM = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const dm = m[i] - meanM;
    cov += da * dm;
    varM += dm * dm;
  }
  if (varM <= 1e-12) return null;
  return Number((cov / varM).toFixed(2));
}

export function extractDailyReturns(bars: OhlcvBar[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i - 1].close > 0) {
      returns.push((bars[i].close - bars[i - 1].close) / bars[i - 1].close);
    }
  }
  return returns;
}

export function computeTechnicalAnalysis(bars: OhlcvBar[]): {
  series: IndicatorPoint[];
  summary: TechnicalSummary;
} {
  const closes = bars.map((b) => b.close);
  const sma20 = calcSMA(closes, 20);
  const sma50 = calcSMA(closes, 50);
  const sma100 = calcSMA(closes, 100);
  const sma200 = calcSMA(closes, 200);
  const ema12 = calcEMA(closes, 12);
  const ema20 = calcEMA(closes, 20);
  const ema26 = calcEMA(closes, 26);
  const ema50 = calcEMA(closes, 50);
  const vwap = calcRollingVWAP(bars, 20);
  const rsi14 = calcRSI(closes, 14);
  const macd = calcMACD(closes);
  const bb = calcBollingerBands(closes, 20, 2);
  const atr14 = calcATR(bars, 14);
  const adx = calcADX(bars, 14);
  const stochRsi = calcStochRSI(rsi14, 14);
  const cci20 = calcCCI(bars, 20);
  const obvData = calcOBV(bars);
  const fibonacci = calcFibonacciRetracement(bars, 120);
  const pivotPoints = calcClassicPivotPoints(bars);

  const series: IndicatorPoint[] = bars.map((b, i) => ({
    date: b.date,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
    sma20: sma20[i],
    sma50: sma50[i],
    sma100: sma100[i],
    sma200: sma200[i],
    ema12: ema12[i],
    ema20: ema20[i],
    ema26: ema26[i],
    ema50: ema50[i],
    vwap: vwap[i],
    rsi14: rsi14[i],
    macd: macd.macdLine[i],
    macdSignal: macd.signalLine[i],
    macdHistogram: macd.histogram[i],
    bbUpper: bb.upper[i],
    bbMiddle: bb.middle[i],
    bbLower: bb.lower[i],
    obv: obvData.series[i] ?? 0,
  }));

  const last = bars.length - 1;
  const latestClose = closes[last] ?? 0;
  const latestRsi = rsi14[last] ?? null;
  const rsiState: 'Overbought' | 'Oversold' | 'Neutral' =
    latestRsi === null ? 'Neutral' : latestRsi >= 70 ? 'Overbought' : latestRsi <= 30 ? 'Oversold' : 'Neutral';

  const cciState: 'Overbought' | 'Oversold' | 'Neutral' =
    cci20 === null ? 'Neutral' : cci20 >= 100 ? 'Overbought' : cci20 <= -100 ? 'Oversold' : 'Neutral';

  const trendStrength: 'Strong Trend' | 'Moderate Trend' | 'Weak / Ranging' | 'Unavailable' =
    adx.adx14 === null
      ? 'Unavailable'
      : adx.adx14 >= 30
        ? 'Strong Trend'
        : adx.adx14 >= 20
          ? 'Moderate Trend'
          : 'Weak / Ranging';

  const latestMacd = macd.macdLine[last] ?? null;
  const latestSignal = macd.signalLine[last] ?? null;
  const latestHist = macd.histogram[last] ?? null;
  const macdBias: 'Bullish Crossover' | 'Bearish Crossover' | 'Neutral' =
    latestMacd !== null && latestSignal !== null
      ? latestMacd > latestSignal
        ? 'Bullish Crossover'
        : 'Bearish Crossover'
      : 'Neutral';

  const bbU = bb.upper[last] ?? null;
  const bbM = bb.middle[last] ?? null;
  const bbL = bb.lower[last] ?? null;
  const percentB =
    bbU !== null && bbL !== null && bbU !== bbL
      ? Number((((latestClose - bbL) / (bbU - bbL)) * 100).toFixed(1))
      : null;

  const momentum10dPct =
    closes.length > 10 && closes[last - 10] > 0
      ? Number((((latestClose - closes[last - 10]) / closes[last - 10]) * 100).toFixed(2))
      : null;

  const recentVols = bars.slice(-20).map((b) => b.volume);
  const avgVol20 =
    recentVols.length > 0 ? Math.round(recentVols.reduce((a, b) => a + b, 0) / recentVols.length) : 0;
  const latestVol = bars[last]?.volume ?? 0;
  const volumeRatio = avgVol20 > 0 ? Number((latestVol / avgVol20).toFixed(2)) : 1;
  const volState: 'High Activity' | 'Normal' | 'Low Activity' =
    volumeRatio >= 1.35 ? 'High Activity' : volumeRatio <= 0.7 ? 'Low Activity' : 'Normal';

  const windowBars = bars.slice(-60);
  const lowsSorted = [...windowBars].map((b) => b.low).sort((a, b) => a - b);
  const highsSorted = [...windowBars].map((b) => b.high).sort((a, b) => b - a);
  const pivotHigh = highsSorted[0] ?? latestClose;
  const pivotLow = lowsSorted[0] ?? latestClose;
  const pivot = (pivotHigh + pivotLow + latestClose) / 3;
  const s1 = Number((2 * pivot - pivotHigh).toFixed(2));
  const s2 = Number((pivot - (pivotHigh - pivotLow)).toFixed(2));
  const r1 = Number((2 * pivot - pivotLow).toFixed(2));
  const r2 = Number((pivot + (pivotHigh - pivotLow)).toFixed(2));

  const supportLevels = Array.from(
    new Set(
      [s1, s2, Number(pivotLow.toFixed(2)), pivotPoints?.s1, pivotPoints?.s2].filter(
        (v): v is number => typeof v === 'number' && v > 0 && v < latestClose
      )
    )
  )
    .sort((a, b) => b - a)
    .slice(0, 3);

  const resistanceLevels = Array.from(
    new Set(
      [r1, r2, Number(pivotHigh.toFixed(2)), pivotPoints?.r1, pivotPoints?.r2].filter(
        (v): v is number => typeof v === 'number' && v > latestClose
      )
    )
  )
    .sort((a, b) => a - b)
    .slice(0, 3);

  const latestSma20 = sma20[last];
  const latestSma50 = sma50[last];
  const latestSma200 = sma200[last];
  let trend: 'Uptrend' | 'Downtrend' | 'Sideways' = 'Sideways';
  if (latestSma20 !== null && latestSma50 !== null) {
    if (latestClose > latestSma20 && latestSma20 > latestSma50) trend = 'Uptrend';
    else if (latestClose < latestSma20 && latestSma20 < latestSma50) trend = 'Downtrend';
  } else if (latestSma20 !== null) {
    if (latestClose > latestSma20 * 1.01) trend = 'Uptrend';
    else if (latestClose < latestSma20 * 0.99) trend = 'Downtrend';
  }

  const returns = extractDailyReturns(bars);
  const meanRet = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance =
    returns.length > 1
      ? returns.reduce((acc, r) => acc + (r - meanRet) ** 2, 0) / (returns.length - 1)
      : 0;
  const dailyStd = Math.sqrt(variance);
  const annualizedVolatilityPct = Number((dailyStd * Math.sqrt(252) * 100).toFixed(2));
  const annualizedReturn = meanRet * 252;
  const riskFreeRate = 0.045;
  const sharpeRatio =
    dailyStd > 1e-9 && returns.length >= 20
      ? Number(((annualizedReturn - riskFreeRate) / (dailyStd * Math.sqrt(252))).toFixed(2))
      : null;

  // Historical downside risk & Sortino Ratio
  const negReturns = returns.filter((r) => r < 0);
  const downsideVar =
    returns.length >= 20
      ? returns.reduce((acc, r) => acc + (r < 0 ? r * r : 0), 0) / returns.length
      : 0;
  const dailyDownsideStd = Math.sqrt(downsideVar);
  const downsideDeviationPct =
    returns.length >= 20 ? Number((dailyDownsideStd * Math.sqrt(252) * 100).toFixed(2)) : null;
  const sortinoRatio =
    dailyDownsideStd > 1e-9 && negReturns.length >= 3 && returns.length >= 20
      ? Number(((annualizedReturn - riskFreeRate) / (dailyDownsideStd * Math.sqrt(252))).toFixed(2))
      : null;

  // Empirical 95% 1-Day VaR (5th percentile daily return)
  let var95DailyPct: number | null = null;
  if (returns.length >= 20) {
    const sortedRets = [...returns].sort((a, b) => a - b);
    const idx = Math.max(0, Math.floor(sortedRets.length * 0.05));
    var95DailyPct = Number((Math.abs(sortedRets[idx]) * 100).toFixed(2));
  }

  // Liquidity risk based on 20D average traded value and share turnover
  const avgDollarVolume = avgVol20 * latestClose;
  const liquidityRisk: 'Low' | 'Moderate' | 'High' =
    avgVol20 >= 500_000 || avgDollarVolume >= 25_000_000
      ? 'Low'
      : avgVol20 >= 75_000 || avgDollarVolume >= 3_000_000
        ? 'Moderate'
        : 'High';

  // ATR-based stop loss & reward levels
  const atrRiskLevels: AtrRiskLevels | null =
    atr14 && atr14 > 0 && latestClose > 0
      ? {
          atr14,
          stopLoss15x: Number(Math.max(0.01, latestClose - 1.5 * atr14).toFixed(2)),
          stopLoss2x: Number(Math.max(0.01, latestClose - 2.0 * atr14).toFixed(2)),
          target2x: Number((latestClose + 2.0 * atr14).toFixed(2)),
          target3x: Number((latestClose + 3.0 * atr14).toFixed(2)),
          riskRewardRatio: Number(((3.0 * atr14) / (1.5 * atr14)).toFixed(2)),
        }
      : null;

  // Price Action summary
  const pctDiff = (ref: number | null) =>
    ref && ref > 0 ? Number((((latestClose - ref) / ref) * 100).toFixed(2)) : null;

  const recent5dReturnPct =
    closes.length > 5 && closes[last - 5] > 0
      ? Number((((latestClose - closes[last - 5]) / closes[last - 5]) * 100).toFixed(2))
      : null;
  const recent20dReturnPct =
    closes.length > 20 && closes[last - 20] > 0
      ? Number((((latestClose - closes[last - 20]) / closes[last - 20]) * 100).toFixed(2))
      : null;

  const fullHigh = Math.max(...bars.map((b) => b.high));
  const fullLow = Math.min(...bars.map((b) => b.low));
  const rangePositionPct =
    fullHigh > fullLow
      ? Number((((latestClose - fullLow) / (fullHigh - fullLow)) * 100).toFixed(1))
      : null;

  const nearestSupport = supportLevels[0] ?? null;
  const nearestResistance = resistanceLevels[0] ?? null;

  const structureLabel =
    trend === 'Uptrend' && (recent20dReturnPct ?? 0) > 2
      ? 'Higher highs & higher lows (constructive upward structure)'
      : trend === 'Downtrend' && (recent20dReturnPct ?? 0) < -2
        ? 'Lower highs & lower lows (bearish distribution structure)'
        : rangePositionPct !== null && rangePositionPct > 80
          ? 'Trading near upper swing range (approaching overhead supply)'
          : rangePositionPct !== null && rangePositionPct < 20
            ? 'Trading near lower swing range (testing demand zone)'
            : 'Consolidating within intermediate trading range';

  let peak = closes[0] ?? 0;
  let maxDd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    if (peak > 0) {
      const dd = ((peak - c) / peak) * 100;
      if (dd > maxDd) maxDd = dd;
    }
  }

  // 20-Day Donchian Breakout / Breakdown Levels
  const recent20Bars = bars.slice(-Math.min(20, bars.length));
  const prior20Bars = bars.length > 20 ? bars.slice(-21, -1) : recent20Bars;
  const rangeHigh20 = Number(Math.max(...prior20Bars.map((b) => b.high)).toFixed(2));
  const rangeLow20 = Number(Math.min(...prior20Bars.map((b) => b.low)).toFixed(2));
  const breakoutLevels: BreakoutLevels = {
    rangeHigh20,
    rangeLow20,
    bullishBreakout: Number((rangeHigh20 * 1.005).toFixed(2)),
    bearishBreakdown: Number((rangeLow20 * 0.995).toFixed(2)),
    status:
      latestClose > rangeHigh20
        ? 'Breakout Above 20D High'
        : latestClose < rangeLow20
          ? 'Breakdown Below 20D Low'
          : 'Inside 20D Range',
  };

  return {
    series,
    summary: {
      latestClose,
      sma20: latestSma20,
      sma50: latestSma50,
      sma100: sma100[last] ?? null,
      sma200: latestSma200 ?? null,
      ema12: ema12[last] ?? null,
      ema20: ema20[last] ?? null,
      ema26: ema26[last] ?? null,
      ema50: ema50[last] ?? null,
      vwap: vwap[last] ?? null,
      momentum10dPct,
      rsi14: latestRsi,
      rsiState,
      macd: {
        line: latestMacd,
        signal: latestSignal,
        histogram: latestHist,
        bias: macdBias,
      },
      bollinger: {
        upper: bbU,
        middle: bbM,
        lower: bbL,
        percentB,
      },
      atr14,
      adx14: adx.adx14,
      plusDI14: adx.plusDI14,
      minusDI14: adx.minusDI14,
      trendStrength,
      stochRsi,
      cci20,
      cciState,
      obv: obvData.latest,
      obvTrend: obvData.trend,
      fibonacci,
      pivotPoints,
      breakoutLevels,
      priceAction: {
        distanceToSma20Pct: pctDiff(latestSma20),
        distanceToSma50Pct: pctDiff(latestSma50),
        distanceToSma200Pct: pctDiff(latestSma200),
        distanceToNearestSupportPct: nearestSupport ? pctDiff(nearestSupport) : null,
        distanceToNearestResistancePct: nearestResistance ? pctDiff(nearestResistance) : null,
        rangePositionPct,
        recent5dReturnPct,
        recent20dReturnPct,
        structureLabel,
      },
      volumeAnalysis: {
        latestVolume: latestVol,
        avgVolume20: avgVol20,
        volumeRatio,
        state: volState,
      },
      supportLevels,
      resistanceLevels,
      trend,
      annualizedVolatilityPct,
      maxDrawdownPct: Number(maxDd.toFixed(2)),
      sharpeRatio,
      sortinoRatio,
      downsideDeviationPct,
      var95DailyPct,
      liquidityRisk,
      atrRiskLevels,
    },
  };
}
