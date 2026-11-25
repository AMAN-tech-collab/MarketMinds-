import { env } from '../config/env.ts';
import type { OhlcvBar } from './marketDataService.ts';
import { calcBollingerBands, calcEMA, calcRSI, calcSMA } from './technicalIndicators.ts';

export interface ModelEvaluationResult {
  modelName: string;
  modelVersion: string;
  mae: number;
  rmse: number;
  mape: number;
  r2: number;
  directionalAccuracy: number;
  predictedNextClose: number;
  predictedHorizonPrice: number;
  expectedReturnPct: number;
  testPoints: Array<{ date: string; actual: number; predicted: number }>;
  backtest: {
    strategyReturnPct: number;
    buyAndHoldReturnPct: number;
    winRatePct: number;
    tradesCount: number;
  };
}

export interface HorizonForecastEntry {
  horizonDays: number;
  label: string;
  status: 'available' | 'insufficient_data';
  requiredSessions: number;
  availableSessions: number;
  predictedPrice: number | null;
  lowerBound: number | null;
  upperBound: number | null;
  uncertaintyPct: number | null;
  expectedReturnPct: number | null;
  modelName: string;
  modelVersion: string;
  trainedAt: string;
  testMape: number;
  testRmse: number;
  testMae: number;
  directionalAccuracy: number;
  note: string;
}

export interface MlPipelineOutput {
  symbol: string;
  exchange: string;
  currency: string;
  engineSource: 'python-fastapi' | 'builtin-quant-ml';
  horizonDays: number;
  currentPrice: number;
  trainSamples: number;
  testSamples: number;
  trainPeriod: { start: string; end: string };
  testPeriod: { start: string; end: string };
  featuresUsed: string[];
  bestModel: string;
  bestModelVersion: string;
  trainedAt: string;
  models: ModelEvaluationResult[];
  forecastTrajectory: Array<{
    day: number;
    label: string;
    predictedPrice: number;
    lowerBand: number;
    upperBand: number;
  }>;
  multiHorizonForecasts: HorizonForecastEntry[];
  methodologyNote: string;
  limitations: string[];
  generatedAt: string;
}

interface Sample {
  date: string;
  features: number[];
  baseClose: number;
  targetReturn: number;
  targetClose: number;
}

// Deterministic LCG PRNG for reproducible Random Forest bootstrapping
function createRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function buildDataset(bars: OhlcvBar[]): { samples: Sample[]; featureNames: string[] } {
  const closes = bars.map((b) => b.close);
  const volumes = bars.map((b) => b.volume);
  const sma5 = calcSMA(closes, 5);
  const sma20 = calcSMA(closes, 20);
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const rsi14 = calcRSI(closes, 14);
  const bb = calcBollingerBands(closes, 20, 2);
  const volSma20 = calcSMA(volumes, 20);

  const featureNames = [
    'ret_1d',
    'ret_3d',
    'ret_5d',
    'momentum_10d',
    'sma5_ratio',
    'sma20_ratio',
    'ema_spread',
    'rsi14_norm',
    'bb_pos',
    'vwap_dev',
    'vol_ratio',
    'rolling_vol_10d',
  ];

  const samples: Sample[] = [];
  for (let i = 26; i < bars.length - 1; i++) {
    const c = closes[i];
    const nextC = closes[i + 1];
    if (c <= 0 || nextC <= 0) continue;
    const s5 = sma5[i];
    const s20 = sma20[i];
    const e12 = ema12[i];
    const e26 = ema26[i];
    const r14 = rsi14[i];
    const bbU = bb.upper[i];
    const bbL = bb.lower[i];
    const v20 = volSma20[i];
    if (
      s5 === null ||
      s20 === null ||
      e12 === null ||
      e26 === null ||
      r14 === null ||
      bbU === null ||
      bbL === null ||
      v20 === null
    ) {
      continue;
    }

    const ret1 = (c - closes[i - 1]) / closes[i - 1];
    const ret3 = (c - closes[i - 3]) / closes[i - 3];
    const ret5 = (c - closes[i - 5]) / closes[i - 5];
    const mom10 = (c - closes[i - 10]) / closes[i - 10];
    const sma5Ratio = (c - s5) / s5;
    const sma20Ratio = (c - s20) / s20;
    const emaSpread = (e12 - e26) / c;
    const rsiNorm = (r14 - 50) / 50;
    const bbPos = bbU !== bbL ? (c - bbL) / (bbU - bbL) - 0.5 : 0;
    const volRatio = v20 > 0 ? Math.min(3, volumes[i] / v20) - 1 : 0;

    let pvSum = 0;
    let volSum = 0;
    for (let k = i - 19; k <= i; k++) {
      const tp = (bars[k].high + bars[k].low + bars[k].close) / 3;
      const v = Math.max(1, bars[k].volume);
      pvSum += tp * v;
      volSum += v;
    }
    const vwap20 = volSum > 0 ? pvSum / volSum : c;
    const vwapDev = vwap20 > 0 ? (c - vwap20) / vwap20 : 0;

    let volSq = 0;
    for (let k = i - 9; k <= i; k++) {
      const r = (closes[k] - closes[k - 1]) / closes[k - 1];
      volSq += r * r;
    }
    const rollingVol10 = Math.sqrt(volSq / 10);

    const targetReturn = (nextC - c) / c;
    samples.push({
      date: bars[i + 1].date,
      baseClose: c,
      targetReturn,
      targetClose: nextC,
      features: [
        ret1,
        ret3,
        ret5,
        mom10,
        sma5Ratio,
        sma20Ratio,
        emaSpread,
        rsiNorm,
        bbPos,
        vwapDev,
        volRatio,
        rollingVol10,
      ],
    });
  }

  return { samples, featureNames };
}

function standardize(trainX: number[][], testX: number[][]) {
  const dims = trainX[0].length;
  const means = new Array(dims).fill(0);
  const stds = new Array(dims).fill(1);

  for (let j = 0; j < dims; j++) {
    let sum = 0;
    for (let i = 0; i < trainX.length; i++) sum += trainX[i][j];
    means[j] = sum / trainX.length;
    let sq = 0;
    for (let i = 0; i < trainX.length; i++) sq += (trainX[i][j] - means[j]) ** 2;
    stds[j] = Math.sqrt(sq / trainX.length) || 1;
  }

  const transform = (rows: number[][]) =>
    rows.map((r) => r.map((v, j) => (v - means[j]) / stds[j]));

  return {
    trainScaled: transform(trainX),
    testScaled: transform(testX),
    transformSingle: (row: number[]) => row.map((v, j) => (v - means[j]) / stds[j]),
  };
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivotRow][col])) pivotRow = row;
    }
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    const pivotVal = M[col][col];
    if (Math.abs(pivotVal) < 1e-12) continue;

    for (let j = col; j <= n; j++) M[col][j] /= pivotVal;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      for (let j = col; j <= n; j++) M[row][j] -= factor * M[col][j];
    }
  }

  return M.map((row) => row[n]);
}

function fitRidgeRegression(X: number[][], y: number[], lambda: number) {
  const n = X.length;
  const d = X[0].length + 1;
  const XtX: number[][] = Array.from({ length: d }, () => new Array(d).fill(0));
  const Xty: number[] = new Array(d).fill(0);

  for (let i = 0; i < n; i++) {
    const row = [1, ...X[i]];
    for (let a = 0; a < d; a++) {
      Xty[a] += row[a] * y[i];
      for (let b = 0; b < d; b++) {
        XtX[a][b] += row[a] * row[b];
      }
    }
  }
  for (let j = 1; j < d; j++) XtX[j][j] += lambda;
  const weights = solveLinearSystem(XtX, Xty);

  return (x: number[]) => {
    let pred = weights[0];
    for (let j = 0; j < x.length; j++) pred += weights[j + 1] * x[j];
    return Math.max(-0.08, Math.min(0.08, pred));
  };
}

interface TreeNode {
  leafValue?: number;
  featureIndex?: number;
  threshold?: number;
  left?: TreeNode;
  right?: TreeNode;
}

function trainDecisionTree(
  X: number[][],
  y: number[],
  depth: number,
  maxDepth: number,
  minLeaf: number,
  rng: () => number
): TreeNode {
  const mean = y.reduce((a, b) => a + b, 0) / y.length;
  if (depth >= maxDepth || y.length < minLeaf * 2) {
    return { leafValue: mean };
  }

  const numFeatures = X[0].length;
  const candidateCount = Math.max(3, Math.floor(Math.sqrt(numFeatures)) + 1);
  const featureIndices: number[] = [];
  while (featureIndices.length < candidateCount) {
    const idx = Math.floor(rng() * numFeatures);
    if (!featureIndices.includes(idx)) featureIndices.push(idx);
  }

  let bestScore = Infinity;
  let bestFeature = -1;
  let bestThreshold = 0;
  let bestLeftIdx: number[] = [];
  let bestRightIdx: number[] = [];

  for (const fIdx of featureIndices) {
    const vals = X.map((row) => row[fIdx]);
    const sorted = [...vals].sort((a, b) => a - b);
    const quantiles = [0.25, 0.5, 0.75];
    for (const q of quantiles) {
      const thresh = sorted[Math.floor(q * (sorted.length - 1))];
      const lIdx: number[] = [];
      const rIdx: number[] = [];
      let lSum = 0;
      let rSum = 0;
      for (let i = 0; i < X.length; i++) {
        if (X[i][fIdx] <= thresh) {
          lIdx.push(i);
          lSum += y[i];
        } else {
          rIdx.push(i);
          rSum += y[i];
        }
      }
      if (lIdx.length < minLeaf || rIdx.length < minLeaf) continue;
      const lMean = lSum / lIdx.length;
      const rMean = rSum / rIdx.length;
      let sse = 0;
      for (const i of lIdx) sse += (y[i] - lMean) ** 2;
      for (const i of rIdx) sse += (y[i] - rMean) ** 2;
      if (sse < bestScore) {
        bestScore = sse;
        bestFeature = fIdx;
        bestThreshold = thresh;
        bestLeftIdx = lIdx;
        bestRightIdx = rIdx;
      }
    }
  }

  if (bestFeature === -1) return { leafValue: mean };

  return {
    featureIndex: bestFeature,
    threshold: bestThreshold,
    left: trainDecisionTree(
      bestLeftIdx.map((i) => X[i]),
      bestLeftIdx.map((i) => y[i]),
      depth + 1,
      maxDepth,
      minLeaf,
      rng
    ),
    right: trainDecisionTree(
      bestRightIdx.map((i) => X[i]),
      bestRightIdx.map((i) => y[i]),
      depth + 1,
      maxDepth,
      minLeaf,
      rng
    ),
  };
}

function predictTree(node: TreeNode, x: number[]): number {
  if (node.leafValue !== undefined) return node.leafValue;
  if (x[node.featureIndex!] <= node.threshold!) {
    return predictTree(node.left!, x);
  }
  return predictTree(node.right!, x);
}

function fitRandomForest(X: number[][], y: number[], numTrees = 25) {
  const rng = createRng(42071);
  const trees: TreeNode[] = [];
  const n = X.length;

  for (let t = 0; t < numTrees; t++) {
    const bootX: number[][] = [];
    const bootY: number[] = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rng() * n);
      bootX.push(X[idx]);
      bootY.push(y[idx]);
    }
    trees.push(trainDecisionTree(bootX, bootY, 0, 4, 6, rng));
  }

  return (x: number[]) => {
    let sum = 0;
    for (const tree of trees) sum += predictTree(tree, x);
    const avg = sum / trees.length;
    return Math.max(-0.08, Math.min(0.08, avg));
  };
}

function fitGradientBoostedTrees(X: number[][], y: number[], rounds = 18, lr = 0.12) {
  const rng = createRng(99137);
  const baseMean = y.reduce((a, b) => a + b, 0) / y.length;
  const preds = new Array(y.length).fill(baseMean);
  const trees: TreeNode[] = [];

  for (let r = 0; r < rounds; r++) {
    const residuals = y.map((actual, i) => actual - preds[i]);
    const tree = trainDecisionTree(X, residuals, 0, 3, 6, rng);
    trees.push(tree);
    for (let i = 0; i < X.length; i++) {
      preds[i] += lr * predictTree(tree, X[i]);
    }
  }

  return (x: number[]) => {
    let out = baseMean;
    for (const tree of trees) out += lr * predictTree(tree, x);
    return Math.max(-0.08, Math.min(0.08, out));
  };
}

function projectHorizonPrice(currentPrice: number, nextDayRet: number, horizonDays: number) {
  // Damped square-root scaling prevents exponential drift on multi-month horizons
  const cap = horizonDays <= 7 ? 0.18 : horizonDays <= 30 ? 0.28 : horizonDays <= 90 ? 0.42 : 0.55;
  const damping = horizonDays <= 7 ? 0.65 : horizonDays <= 30 ? 0.52 : horizonDays <= 90 ? 0.38 : 0.28;
  const drift = nextDayRet * Math.sqrt(horizonDays) * damping;
  const clamped = Math.max(-cap, Math.min(cap, drift));
  return {
    predictedPrice: Number((currentPrice * (1 + clamped)).toFixed(2)),
    expectedReturnPct: Number((clamped * 100).toFixed(2)),
  };
}

function evaluateModel(
  modelName: string,
  modelVersion: string,
  testSamples: Sample[],
  testScaled: number[][],
  predictReturn: (x: number[]) => number,
  latestFeaturesScaled: number[],
  currentPrice: number,
  horizonDays: number
): ModelEvaluationResult & { nextDayRet: number } {
  let absErrSum = 0;
  let sqErrSum = 0;
  let apeSum = 0;
  let dirCorrect = 0;
  let equity = 1;
  let tradesCount = 0;
  let winningTrades = 0;

  const actuals = testSamples.map((s) => s.targetClose);
  const meanActual = actuals.reduce((a, b) => a + b, 0) / actuals.length;
  let ssTot = 0;

  const testPoints: Array<{ date: string; actual: number; predicted: number }> = [];

  for (let i = 0; i < testSamples.length; i++) {
    const s = testSamples[i];
    const predRet = predictReturn(testScaled[i]);
    const predClose = Number((s.baseClose * (1 + predRet)).toFixed(2));
    const err = s.targetClose - predClose;
    absErrSum += Math.abs(err);
    sqErrSum += err * err;
    apeSum += Math.abs(err) / Math.max(1, s.targetClose);
    ssTot += (s.targetClose - meanActual) ** 2;

    if ((predRet >= 0 && s.targetReturn >= 0) || (predRet < 0 && s.targetReturn < 0)) {
      dirCorrect++;
    }

    if (predRet > 0.0015) {
      tradesCount++;
      equity *= 1 + s.targetReturn;
      if (s.targetReturn > 0) winningTrades++;
    }

    testPoints.push({
      date: s.date,
      actual: s.targetClose,
      predicted: predClose,
    });
  }

  const n = testSamples.length;
  const mae = Number((absErrSum / n).toFixed(2));
  const rmse = Number(Math.sqrt(sqErrSum / n).toFixed(2));
  const mape = Number(((apeSum / n) * 100).toFixed(2));
  const r2 = ssTot > 0 ? Number((1 - sqErrSum / ssTot).toFixed(3)) : 0;
  const directionalAccuracy = Number(((dirCorrect / n) * 100).toFixed(1));

  const buyAndHoldReturnPct = Number(
    (
      ((testSamples[n - 1].targetClose - testSamples[0].baseClose) /
        testSamples[0].baseClose) *
      100
    ).toFixed(2)
  );
  const strategyReturnPct = Number(((equity - 1) * 100).toFixed(2));
  const winRatePct = tradesCount > 0 ? Number(((winningTrades / tradesCount) * 100).toFixed(1)) : 0;

  const nextDayRet = predictReturn(latestFeaturesScaled);
  const predictedNextClose = Number((currentPrice * (1 + nextDayRet)).toFixed(2));
  const proj = projectHorizonPrice(currentPrice, nextDayRet, horizonDays);

  return {
    modelName,
    modelVersion,
    mae,
    rmse,
    mape,
    r2,
    directionalAccuracy,
    predictedNextClose,
    predictedHorizonPrice: proj.predictedPrice,
    expectedReturnPct: proj.expectedReturnPct,
    testPoints,
    backtest: {
      strategyReturnPct,
      buyAndHoldReturnPct,
      winRatePct,
      tradesCount,
    },
    nextDayRet,
  };
}

function buildMultiHorizonForecasts(
  currentPrice: number,
  nextDayRet: number,
  winner: ModelEvaluationResult,
  totalSessions: number,
  trainedAt: string
): HorizonForecastEntry[] {
  const horizons: Array<{ days: number; label: string; minSessions: number }> = [
    { days: 1, label: '1-Day Forecast', minSessions: 40 },
    { days: 7, label: '7-Day Forecast', minSessions: 40 },
    { days: 30, label: '30-Day Forecast', minSessions: 80 },
    { days: 90, label: '90-Day Forecast', minSessions: 140 },
    { days: 180, label: '180-Day Forecast', minSessions: 195 },
  ];

  return horizons.map((h) => {
    if (totalSessions < h.minSessions) {
      return {
        horizonDays: h.days,
        label: h.label,
        status: 'insufficient_data',
        requiredSessions: h.minSessions,
        availableSessions: totalSessions,
        predictedPrice: null,
        lowerBound: null,
        upperBound: null,
        uncertaintyPct: null,
        expectedReturnPct: null,
        modelName: winner.modelName,
        modelVersion: winner.modelVersion,
        trainedAt,
        testMape: winner.mape,
        testRmse: winner.rmse,
        testMae: winner.mae,
        directionalAccuracy: winner.directionalAccuracy,
        note: `Requires at least ${h.minSessions} clean trading sessions (only ${totalSessions} available).`,
      };
    }

    const proj = projectHorizonPrice(currentPrice, nextDayRet, h.days);
    // Out-of-sample RMSE scales by sqrt(horizon) for 1-sigma uncertainty band
    const halfBand = winner.rmse * Math.sqrt(h.days) * 0.95;
    const lowerBound = Number(Math.max(0.01, proj.predictedPrice - halfBand).toFixed(2));
    const upperBound = Number((proj.predictedPrice + halfBand).toFixed(2));
    const uncertaintyPct =
      proj.predictedPrice > 0 ? Number(((halfBand / proj.predictedPrice) * 100).toFixed(2)) : null;

    return {
      horizonDays: h.days,
      label: h.label,
      status: 'available',
      requiredSessions: h.minSessions,
      availableSessions: totalSessions,
      predictedPrice: proj.predictedPrice,
      lowerBound,
      upperBound,
      uncertaintyPct,
      expectedReturnPct: proj.expectedReturnPct,
      modelName: winner.modelName,
      modelVersion: winner.modelVersion,
      trainedAt,
      testMape: winner.mape,
      testRmse: winner.rmse,
      testMae: winner.mae,
      directionalAccuracy: winner.directionalAccuracy,
      note:
        h.days <= 7
          ? 'Short-horizon statistical extrapolation anchored to held-out 1-step RMSE.'
          : 'Longer-horizon band widens with √t uncertainty; future earnings and macro shocks dominate beyond 30 sessions.',
    };
  });
}

export async function runMlPredictionPipeline(
  symbol: string,
  exchange: string,
  bars: OhlcvBar[],
  horizonDays = 7,
  currency = 'INR'
): Promise<MlPipelineOutput> {
  const trainedAt = new Date().toISOString();

  // If an external Python FastAPI AI service is configured, attempt to proxy with strict timeout
  if (env.analysisServiceUrl) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const resp = await fetch(`${env.analysisServiceUrl}/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ symbol, exchange, currency, horizon_days: horizonDays, bars }),
        });
        clearTimeout(timer);
        if (resp.ok) {
          const externalData = await resp.json();
          const bestObj =
            externalData.models?.find((m: any) => m.modelName === externalData.bestModel) ||
            externalData.models?.[0];
          const impliedNextRet =
            bestObj && externalData.currentPrice > 0
              ? (bestObj.predictedNextClose - externalData.currentPrice) / externalData.currentPrice
              : 0;
          return {
            ...externalData,
            currency: externalData.currency || currency,
            trainPeriod: externalData.trainPeriod || {
              start: bars[0]?.date || '',
              end: bars[Math.floor(bars.length * 0.8)]?.date || '',
            },
            testPeriod: externalData.testPeriod || {
              start: bars[Math.floor(bars.length * 0.8)]?.date || '',
              end: bars[bars.length - 1]?.date || '',
            },
            bestModelVersion: bestObj?.modelVersion || 'python-fastapi-v2',
            trainedAt: externalData.generatedAt || trainedAt,
            multiHorizonForecasts:
              externalData.multiHorizonForecasts ||
              (bestObj
                ? buildMultiHorizonForecasts(
                    externalData.currentPrice,
                    impliedNextRet,
                    bestObj,
                    bars.length,
                    trainedAt
                  )
                : []),
            engineSource: 'python-fastapi',
          };
        }
        if (resp.status >= 400 && resp.status < 500) break;
      } catch {
        clearTimeout(timer);
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
  }

  const { samples, featureNames } = buildDataset(bars);
  if (samples.length < 40) {
    throw new Error(
      `Insufficient clean historical observations (${samples.length}) to train and validate ML models. At least 40 trading sessions are required.`
    );
  }

  const splitIdx = Math.floor(samples.length * 0.8);
  const trainSamples = samples.slice(0, splitIdx);
  const testSamples = samples.slice(splitIdx);

  const trainX = trainSamples.map((s) => s.features);
  const trainY = trainSamples.map((s) => s.targetReturn);
  const testX = testSamples.map((s) => s.features);

  const { trainScaled, testScaled, transformSingle } = standardize(trainX, testX);
  const latestFeaturesScaled = transformSingle(samples[samples.length - 1].features);
  const currentPrice = bars[bars.length - 1].close;

  const ridgePred = fitRidgeRegression(trainScaled, trainY, 1.5);
  const rfPred = fitRandomForest(trainScaled, trainY, 25);
  const gbtPred = fitGradientBoostedTrees(trainScaled, trainY, 18, 0.12);

  const evaluated = [
    evaluateModel(
      'Linear Regression (Ridge L2)',
      'v2.1-ols-ridge',
      testSamples,
      testScaled,
      ridgePred,
      latestFeaturesScaled,
      currentPrice,
      horizonDays
    ),
    evaluateModel(
      'Random Forest Regressor (25 Trees)',
      'v2.1-rf-bagged',
      testSamples,
      testScaled,
      rfPred,
      latestFeaturesScaled,
      currentPrice,
      horizonDays
    ),
    evaluateModel(
      'Gradient Boosted Trees (XGBoost-style)',
      'v2.1-gbt-boost',
      testSamples,
      testScaled,
      gbtPred,
      latestFeaturesScaled,
      currentPrice,
      horizonDays
    ),
  ];

  // Rank by lowest RMSE on held-out test set
  const ranked = [...evaluated].sort((a, b) => a.rmse - b.rmse);
  const winnerWithRet = ranked[0];

  const models: ModelEvaluationResult[] = evaluated.map(({ nextDayRet: _unused, ...rest }) => rest);
  const winner = models.find((m) => m.modelName === winnerWithRet.modelName) || models[0];

  const stepPoints = Math.min(horizonDays, 30);
  const dailyStd = winner.rmse;
  const forecastTrajectory = Array.from({ length: stepPoints }, (_, i) => {
    const day = Math.max(1, Math.round(((i + 1) / stepPoints) * horizonDays));
    const progress = day / horizonDays;
    const projected =
      currentPrice + (winner.predictedHorizonPrice - currentPrice) * Math.sqrt(progress);
    const spread = dailyStd * Math.sqrt(day) * 0.9;
    return {
      day,
      label: `T+${day}D`,
      predictedPrice: Number(projected.toFixed(2)),
      lowerBand: Number(Math.max(0.01, projected - spread).toFixed(2)),
      upperBand: Number((projected + spread).toFixed(2)),
    };
  });

  const multiHorizonForecasts = buildMultiHorizonForecasts(
    currentPrice,
    winnerWithRet.nextDayRet,
    winner,
    samples.length,
    trainedAt
  );

  return {
    symbol,
    exchange,
    currency,
    engineSource: 'builtin-quant-ml',
    horizonDays,
    currentPrice,
    trainSamples: trainSamples.length,
    testSamples: testSamples.length,
    trainPeriod: {
      start: trainSamples[0]?.date || bars[0]?.date || '',
      end: trainSamples[trainSamples.length - 1]?.date || '',
    },
    testPeriod: {
      start: testSamples[0]?.date || '',
      end: testSamples[testSamples.length - 1]?.date || bars[bars.length - 1]?.date || '',
    },
    featuresUsed: featureNames,
    bestModel: winner.modelName,
    bestModelVersion: winner.modelVersion,
    trainedAt,
    models,
    forecastTrajectory,
    multiHorizonForecasts,
    methodologyNote:
      'Models are trained chronologically on the first 80% of cleaned OHLCV sessions and evaluated out-of-sample on the most recent 20% to prevent look-ahead bias. Multi-horizon uncertainty intervals scale with √t from held-out test RMSE.',
    limitations: [
      'Held-out test metrics (MAE, RMSE, MAPE, Directional Accuracy) measure historical fit only and do not guarantee future accuracy.',
      'Price-volume models cannot anticipate sudden earnings surprises, central bank decisions, geopolitical shocks, or FX swings.',
      'Walk-forward backtests exclude brokerage fees, exchange taxes, FX spreads, and market impact slippage.',
      'All outputs are strictly for quantitative research and educational use, not personalized investment advice.',
    ],
    generatedAt: trainedAt,
  };
}
