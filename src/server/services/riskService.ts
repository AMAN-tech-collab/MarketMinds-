import { calcBeta, calcPearsonCorrelation } from './technicalIndicators.ts';

export interface TradeRiskInput {
  accountCapital: number;
  riskPercentPerTrade: number;
  entryPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  currency?: string;
  atr?: number;
}

export interface TradeRiskResult {
  currency: string;
  riskAmountInr: number;
  riskAmount: number;
  riskPerShare: number;
  rewardPerShare: number;
  riskRewardRatio: number;
  recommendedShares: number;
  positionValueInr: number;
  positionValue: number;
  capitalAllocatedPct: number;
  potentialLossInr: number;
  potentialLoss: number;
  potentialProfitInr: number;
  potentialProfit: number;
  breakevenWinRatePct: number;
  atrSuggestedStopLoss: number | null;
  atrSuggestedTarget: number | null;
  warnings: string[];
  limitations: string[];
}

export function calculateTradeRisk(input: TradeRiskInput): TradeRiskResult {
  const { accountCapital, riskPercentPerTrade, entryPrice, stopLossPrice, targetPrice, atr } = input;
  const currency = (input.currency || 'INR').toUpperCase();
  const riskAmount = Number(((accountCapital * riskPercentPerTrade) / 100).toFixed(2));
  const riskPerShare = Math.abs(entryPrice - stopLossPrice);
  const rewardPerShare = Math.abs(targetPrice - entryPrice);

  const riskRewardRatio =
    riskPerShare > 0 ? Number((rewardPerShare / riskPerShare).toFixed(2)) : 0;
  const maxSharesByRisk = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
  const maxSharesByCapital = entryPrice > 0 ? Math.floor(accountCapital / entryPrice) : 0;
  const recommendedShares = Math.max(0, Math.min(maxSharesByRisk, maxSharesByCapital));

  const positionValue = Number((recommendedShares * entryPrice).toFixed(2));
  const capitalAllocatedPct =
    accountCapital > 0 ? Number(((positionValue / accountCapital) * 100).toFixed(2)) : 0;
  const potentialLoss = Number((recommendedShares * riskPerShare).toFixed(2));
  const potentialProfit = Number((recommendedShares * rewardPerShare).toFixed(2));
  const breakevenWinRatePct =
    riskRewardRatio > 0 ? Number(((1 / (1 + riskRewardRatio)) * 100).toFixed(1)) : 100;

  const isLong = targetPrice >= entryPrice;
  const atrSuggestedStopLoss =
    atr && atr > 0
      ? Number((isLong ? entryPrice - 1.5 * atr : entryPrice + 1.5 * atr).toFixed(2))
      : null;
  const atrSuggestedTarget =
    atr && atr > 0
      ? Number((isLong ? entryPrice + 3.0 * atr : entryPrice - 3.0 * atr).toFixed(2))
      : null;

  const warnings: string[] = [];
  if (riskPercentPerTrade > 2.5) {
    warnings.push(
      `Risking ${riskPercentPerTrade}% of total capital on a single equity trade is aggressive; institutional desks typically cap single-trade risk at 1%–2%.`
    );
  }
  if (riskRewardRatio < 1.5) {
    warnings.push(
      `Risk/Reward ratio (${riskRewardRatio}:1) is below 1.5:1, requiring a ${breakevenWinRatePct}%+ win rate just to break even before brokerage and taxes.`
    );
  }
  if (capitalAllocatedPct > 30) {
    warnings.push(
      `Position requires ${capitalAllocatedPct}% of account capital, creating single-stock concentration risk.`
    );
  }
  if (isLong && stopLossPrice >= entryPrice) {
    warnings.push('For a long trade, Stop-Loss should be set strictly below Entry Price.');
  }
  warnings.push(
    'Calculations exclude brokerage, exchange fees, stamp duty/STT, FX conversion spreads, and overnight gap slippage. Returns are never guaranteed.'
  );

  const limitations = [
    'Stop-loss execution assumes fill at the exact stop price; overnight gaps or illiquid order books can widen realized loss.',
    'ATR levels reflect trailing 14-session volatility and can understate tail risk around earnings or central bank events.',
  ];

  return {
    currency,
    riskAmountInr: riskAmount,
    riskAmount,
    riskPerShare: Number(riskPerShare.toFixed(2)),
    rewardPerShare: Number(rewardPerShare.toFixed(2)),
    riskRewardRatio,
    recommendedShares,
    positionValueInr: positionValue,
    positionValue,
    capitalAllocatedPct,
    potentialLossInr: potentialLoss,
    potentialLoss,
    potentialProfitInr: potentialProfit,
    potentialProfit,
    breakevenWinRatePct,
    atrSuggestedStopLoss,
    atrSuggestedTarget,
    warnings,
    limitations,
  };
}

export interface PortfolioRiskHoldingInput {
  symbol: string;
  exchange?: string;
  country?: string;
  currency?: string;
  sector: string;
  currentValue: number; // already converted into baseCurrency
  volatilityPct?: number;
  maxDrawdownPct?: number;
  dailyReturns?: number[];
}

export function analyzePortfolioDiversification(
  holdings: PortfolioRiskHoldingInput[],
  options?: {
    baseCurrency?: string;
    benchmarkReturns?: number[];
    benchmarkName?: string;
  }
) {
  const baseCurrency = (options?.baseCurrency || 'INR').toUpperCase();
  const totalValue = holdings.reduce((acc, h) => acc + h.currentValue, 0);
  if (totalValue <= 0 || holdings.length === 0) {
    return {
      baseCurrency,
      totalValue: 0,
      holdingCount: 0,
      sectorCount: 0,
      countryCount: 0,
      currencyCount: 0,
      hhiScore: 0,
      diversificationGrade: 'N/A',
      weightedVolatilityPct: 0,
      estimatedMaxDrawdownPct: 0,
      portfolioBeta: null as number | null,
      portfolioSharpeRatio: null as number | null,
      benchmarkName: options?.benchmarkName || 'S&P 500',
      largestPositionPct: 0,
      largestSectorPct: 0,
      currencyExposure: [] as Array<{ currency: string; value: number; weightPct: number }>,
      countryExposure: [] as Array<{ country: string; value: number; weightPct: number }>,
      correlationMatrix: [] as Array<{ symbol: string; correlations: Record<string, number | null> }>,
      warnings: ['Add holdings to your portfolio to evaluate concentration, correlation, currency, and drawdown risk.'],
      limitations: [
        'Historical volatility, Beta, Sharpe Ratio, and pairwise correlations are backward-looking and shift sharply during market stress.',
      ],
    };
  }

  const sectorTotals = new Map<string, number>();
  const countryTotals = new Map<string, number>();
  const currencyTotals = new Map<string, number>();
  let hhiPosition = 0;
  let largestPositionPct = 0;
  let weightedVol = 0;
  let weightedDd = 0;

  for (const h of holdings) {
    const weight = h.currentValue / totalValue;
    const pct = weight * 100;
    hhiPosition += pct * pct;
    if (pct > largestPositionPct) largestPositionPct = pct;
    sectorTotals.set(h.sector, (sectorTotals.get(h.sector) || 0) + h.currentValue);
    const country = h.country || 'India';
    const currency = (h.currency || 'INR').toUpperCase();
    countryTotals.set(country, (countryTotals.get(country) || 0) + h.currentValue);
    currencyTotals.set(currency, (currencyTotals.get(currency) || 0) + h.currentValue);
    weightedVol += weight * (h.volatilityPct ?? 24);
    weightedDd += weight * (h.maxDrawdownPct ?? 18);
  }

  let largestSectorPct = 0;
  let largestSectorName = '';
  for (const [sector, val] of sectorTotals.entries()) {
    const pct = (val / totalValue) * 100;
    if (pct > largestSectorPct) {
      largestSectorPct = pct;
      largestSectorName = sector;
    }
  }

  const currencyExposure = Array.from(currencyTotals.entries())
    .map(([currency, value]) => ({
      currency,
      value: Number(value.toFixed(2)),
      weightPct: Number(((value / totalValue) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.value - a.value);

  const countryExposure = Array.from(countryTotals.entries())
    .map(([country, value]) => ({
      country,
      value: Number(value.toFixed(2)),
      weightPct: Number(((value / totalValue) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.value - a.value);

  // Build weighted portfolio daily return series from holdings with real return series
  const holdingsWithReturns = holdings.filter((h) => h.dailyReturns && h.dailyReturns.length >= 20);
  let portfolioBeta: number | null = null;
  let portfolioSharpeRatio: number | null = null;
  let realizedPortfolioVolPct: number | null = null;

  if (holdingsWithReturns.length > 0) {
    const minLen = Math.min(...holdingsWithReturns.map((h) => h.dailyReturns!.length));
    const subTotal = holdingsWithReturns.reduce((s, h) => s + h.currentValue, 0);
    const portReturns: number[] = [];
    for (let i = 0; i < minLen; i++) {
      let dayRet = 0;
      for (const h of holdingsWithReturns) {
        const w = h.currentValue / subTotal;
        const arr = h.dailyReturns!;
        dayRet += w * arr[arr.length - minLen + i];
      }
      portReturns.push(dayRet);
    }

    const meanR = portReturns.reduce((s, v) => s + v, 0) / portReturns.length;
    const variance =
      portReturns.reduce((acc, r) => acc + (r - meanR) ** 2, 0) / Math.max(1, portReturns.length - 1);
    const annVol = Math.sqrt(variance) * Math.sqrt(252);
    realizedPortfolioVolPct = Number((annVol * 100).toFixed(2));

    if (annVol > 1e-6) {
      const annRet = meanR * 252;
      portfolioSharpeRatio = Number(((annRet - 0.045) / annVol).toFixed(2));
    }

    if (options?.benchmarkReturns && options.benchmarkReturns.length >= 20) {
      portfolioBeta = calcBeta(portReturns, options.benchmarkReturns);
    }
  }

  // Pairwise correlation matrix (up to top 8 holdings by weight)
  const topForMatrix = [...holdingsWithReturns]
    .sort((a, b) => b.currentValue - a.currentValue)
    .slice(0, 8);

  const correlationMatrix = topForMatrix.map((row) => {
    const correlations: Record<string, number | null> = {};
    for (const col of topForMatrix) {
      if (row.symbol === col.symbol) {
        correlations[col.symbol] = 1;
      } else {
        correlations[col.symbol] = calcPearsonCorrelation(row.dailyReturns!, col.dailyReturns!);
      }
    }
    return { symbol: row.symbol, correlations };
  });

  const diversificationFactor = Math.max(0.65, Math.min(1, Math.sqrt(hhiPosition / 10000) * 0.45 + 0.6));
  const weightedVolatilityPct =
    realizedPortfolioVolPct ?? Number((weightedVol * diversificationFactor).toFixed(2));
  const estimatedMaxDrawdownPct = Number((weightedDd * diversificationFactor).toFixed(2));

  const diversificationGrade =
    hhiPosition <= 1500 && sectorTotals.size >= 4
      ? 'Well Diversified'
      : hhiPosition <= 3000 && sectorTotals.size >= 2
        ? 'Moderately Diversified'
        : 'Concentrated';

  const warnings: string[] = [];
  if (largestPositionPct > 35) {
    warnings.push(`Single holding concentration is ${largestPositionPct.toFixed(1)}% of portfolio value.`);
  }
  if (largestSectorPct > 45) {
    warnings.push(
      `${largestSectorName} represents ${largestSectorPct.toFixed(1)}% of total exposure, increasing sector-specific drawdown risk.`
    );
  }
  if (currencyExposure.length === 1 && holdings.length > 0) {
    warnings.push(
      `100% of holdings are denominated in ${currencyExposure[0].currency}; consider geographic/currency diversification if appropriate.`
    );
  } else if (currencyExposure.length > 1) {
    const foreignPct = currencyExposure
      .filter((c) => c.currency !== baseCurrency)
      .reduce((s, c) => s + c.weightPct, 0);
    if (foreignPct >= 30) {
      warnings.push(
        `${foreignPct.toFixed(1)}% of portfolio value is exposed to non-${baseCurrency} currencies; FX swings directly impact converted returns.`
      );
    }
  }
  if (holdings.length < 4) {
    warnings.push('Portfolio holds fewer than 4 equities; idiosyncratic single-company risk remains elevated.');
  }

  const limitations = [
    'Sharpe ratio uses an illustrative 4.5% annualized risk-free benchmark and trailing 6-month daily returns, which may not reflect future regimes.',
    'Beta is computed against the selected market benchmark over overlapping trading days; cross-timezone exchange holidays can slightly attenuate daily correlation.',
    'Historical correlation matrices frequently converge toward 1.0 during systemic global sell-offs.',
  ];

  return {
    baseCurrency,
    totalValue: Number(totalValue.toFixed(2)),
    holdingCount: holdings.length,
    sectorCount: sectorTotals.size,
    countryCount: countryTotals.size,
    currencyCount: currencyTotals.size,
    hhiScore: Math.round(hhiPosition),
    diversificationGrade,
    weightedVolatilityPct,
    estimatedMaxDrawdownPct,
    portfolioBeta,
    portfolioSharpeRatio,
    benchmarkName: options?.benchmarkName || 'S&P 500',
    largestPositionPct: Number(largestPositionPct.toFixed(1)),
    largestSectorPct: Number(largestSectorPct.toFixed(1)),
    currencyExposure,
    countryExposure,
    correlationMatrix,
    warnings,
    limitations,
  };
}
