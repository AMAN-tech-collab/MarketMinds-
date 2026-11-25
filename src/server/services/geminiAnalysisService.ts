import { Type } from '@google/genai';
import type { StockFundamentals, StockQuote } from './marketDataService.ts';
import type { TechnicalSummary } from './technicalIndicators.ts';
import type { MlPipelineOutput } from './mlPipelineService.ts';
import {
  executeStructuredAiTask,
  type AiProviderAttempt,
  type AiProviderId,
} from './ai/providerClient.ts';

export interface AiStockAnalysisReport {
  decision: 'BUY' | 'SELL' | 'HOLD' | 'WAIT';
  confidenceScore: number;
  riskScore: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
  headline: string;
  executiveSummary: string;
  currentMarketOverview: string;
  rationale: string;
  technicalAnalysisSummary: string;
  fundamentalAnalysisSummary: string;
  trendAnalysis: string;
  supportResistanceNote: string;
  riskAssessment: string;
  marketSentimentNote: string;
  mlForecastInterpretation: string;
  forecastLimitationsNote: string;
  shortTermOutlook: string;
  mediumTermOutlook: string;
  longTermOutlook: string;
  conclusion: string;
  supportingIndicators: string[];
  bullishFactors: string[];
  bearishFactors: string[];
  keyStrengths: string[];
  keyRisks: string[];
  bullishScenario: string;
  bearishScenario: string;
  verifiedFacts: string[];
  modelEstimates: string[];
  aiInterpretations: string[];
  fundamentalNote: string;
  limitations: string[];
  disclaimer: string;
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  modelStatus: string;
  aiEngine: string;
  generatedAt: string;
  generated_at: string;
  cached: boolean;
  stale: boolean;
  requestId: string;
  providersTried: AiProviderAttempt[];
}

export interface AiSynthesisEnvelope {
  status: 'success' | 'cached' | 'unavailable';
  narrative: AiStockAnalysisReport | null;
  provider: string | null;
  model: string | null;
  generated_at: string | null;
  cached: boolean;
  stale: boolean;
  requestId?: string;
  providersTried?: AiProviderAttempt[];
  error?: string;
  errorCode?: string;
}

function buildQuantitativeScore(
  quote: StockQuote,
  technical: TechnicalSummary,
  ml: MlPipelineOutput | null
): {
  decision: 'BUY' | 'SELL' | 'HOLD' | 'WAIT';
  confidence: number;
  riskScore: number;
  riskLevel: 'LOW' | 'MODERATE' | 'HIGH';
  signals: string[];
} {
  let score = 0;
  const signals: string[] = [];

  if (technical.trend === 'Uptrend') {
    score += 2;
    signals.push(
      `Primary trend is Uptrend (Close ${quote.currency} ${technical.latestClose} above SMA20/SMA50)`
    );
  } else if (technical.trend === 'Downtrend') {
    score -= 2;
    signals.push(
      `Primary trend is Downtrend (Close ${quote.currency} ${technical.latestClose} below SMA20/SMA50)`
    );
  } else {
    signals.push('Price action is consolidating in a Sideways range');
  }

  if (technical.rsi14 !== null) {
    if (technical.rsi14 < 32) {
      score += 1;
      signals.push(`RSI(14) at ${technical.rsi14} indicates oversold conditions`);
    } else if (technical.rsi14 > 72) {
      score -= 1;
      signals.push(`RSI(14) at ${technical.rsi14} signals overbought extension`);
    } else {
      signals.push(`RSI(14) at ${technical.rsi14} sits in neutral momentum territory`);
    }
  }

  if (technical.macd.bias === 'Bullish Crossover') {
    score += 1;
    signals.push(`MACD (${technical.macd.line}) is above Signal (${technical.macd.signal})`);
  } else if (technical.macd.bias === 'Bearish Crossover') {
    score -= 1;
    signals.push(`MACD (${technical.macd.line}) is below Signal (${technical.macd.signal})`);
  }

  if (technical.adx14 !== null) {
    signals.push(`ADX(14) at ${technical.adx14} signals ${technical.trendStrength}`);
  }

  if (ml) {
    const best = ml.models.find((m) => m.modelName === ml.bestModel) || ml.models[0];
    if (best) {
      if (best.expectedReturnPct > 1.5 && best.directionalAccuracy >= 52) {
        score += 1;
        signals.push(
          `${best.modelName} projects ${best.expectedReturnPct >= 0 ? '+' : ''}${best.expectedReturnPct}% (${best.directionalAccuracy}% test directional accuracy)`
        );
      } else if (best.expectedReturnPct < -1.5 && best.directionalAccuracy >= 52) {
        score -= 1;
        signals.push(
          `${best.modelName} projects ${best.expectedReturnPct}% (${best.directionalAccuracy}% test directional accuracy)`
        );
      } else {
        signals.push(
          `${best.modelName} test MAPE is ${best.mape}% with modest directional conviction (${best.directionalAccuracy}%)`
        );
      }
    }
  }

  const riskScore = Math.max(
    12,
    Math.min(
      96,
      Math.round(technical.annualizedVolatilityPct * 1.45 + technical.maxDrawdownPct * 0.9)
    )
  );

  const riskLevel: 'LOW' | 'MODERATE' | 'HIGH' =
    riskScore >= 68 || technical.annualizedVolatilityPct >= 34 || technical.maxDrawdownPct >= 28
      ? 'HIGH'
      : riskScore >= 42 || technical.annualizedVolatilityPct >= 22 || technical.maxDrawdownPct >= 16
        ? 'MODERATE'
        : 'LOW';

  let decision: 'BUY' | 'SELL' | 'HOLD' | 'WAIT' = 'HOLD';
  if (score >= 3) decision = 'BUY';
  else if (score <= -3) decision = 'SELL';
  else if (riskLevel === 'HIGH' && Math.abs(score) <= 1) decision = 'WAIT';
  else decision = 'HOLD';

  const baseConf = 50 + Math.abs(score) * 6;
  const volPenalty = riskLevel === 'HIGH' ? 8 : riskLevel === 'MODERATE' ? 3 : 0;
  const confidence = Math.max(42, Math.min(78, Math.round(baseConf - volPenalty)));

  return { decision, confidence, riskScore, riskLevel, signals };
}

const ANALYSIS_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    decision: {
      type: Type.STRING,
      description: 'Must be exactly one of BUY, SELL, HOLD, or WAIT',
    },
    confidenceScore: {
      type: Type.NUMBER,
      description: 'Calibrated confidence percentage between 40 and 82',
    },
    riskScore: {
      type: Type.NUMBER,
      description: 'Numeric risk score between 1 and 100 (higher = riskier)',
    },
    riskLevel: {
      type: Type.STRING,
      description: 'Must be LOW, MODERATE, or HIGH',
    },
    headline: {
      type: Type.STRING,
      description: 'Concise 1-sentence institutional research headline',
    },
    executiveSummary: {
      type: Type.STRING,
      description: '3-sentence executive summary synthesizing price action, fundamentals, ML validation, and risk posture',
    },
    currentMarketOverview: {
      type: Type.STRING,
      description: '2-sentence overview of current trading session, 52W positioning, and volume participation',
    },
    rationale: {
      type: Type.STRING,
      description: '2-3 sentence transparent decision rationale linking technicals, fundamentals, risk, and ML output',
    },
    technicalAnalysisSummary: {
      type: Type.STRING,
      description: '2-3 sentence technical structure summary covering trend, MAs, RSI, MACD, ADX, VWAP, and volume',
    },
    fundamentalAnalysisSummary: {
      type: Type.STRING,
      description: '2-3 sentence fundamental summary citing only verified valuation, margin, balance sheet, and cash flow metrics (explicitly noting missing items)',
    },
    trendAnalysis: {
      type: Type.STRING,
      description: '2-sentence analysis of multi-timeframe moving average alignment and trend strength',
    },
    supportResistanceNote: {
      type: Type.STRING,
      description: '1-2 sentence assessment of key support/resistance zones, pivots, and Fibonacci levels',
    },
    riskAssessment: {
      type: Type.STRING,
      description: '1-2 sentence assessment of volatility, drawdown, beta, Sharpe/Sortino, and liquidity risk',
    },
    marketSentimentNote: {
      type: Type.STRING,
      description: '1-2 sentence summary of market/news sentiment and sector context based on provided news/peer facts',
    },
    mlForecastInterpretation: {
      type: Type.STRING,
      description: '2-sentence interpretation of ML out-of-sample accuracy (MAE, RMSE, MAPE, directional accuracy) and forecast range',
    },
    forecastLimitationsNote: {
      type: Type.STRING,
      description: '1-2 sentence explanation of ML model test accuracy vs future forecast uncertainty',
    },
    shortTermOutlook: {
      type: Type.STRING,
      description: '1-2 sentence 1-4 week technical & momentum outlook',
    },
    mediumTermOutlook: {
      type: Type.STRING,
      description: '1-2 sentence 1-6 month trend & swing outlook',
    },
    longTermOutlook: {
      type: Type.STRING,
      description: '1-2 sentence 1Y+ structural & valuation perspective',
    },
    conclusion: {
      type: Type.STRING,
      description: '2-sentence balanced research conclusion and key confirmation triggers to watch',
    },
    supportingIndicators: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 5 concise indicator evidence bullets citing exact numbers',
    },
    bullishFactors: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 4 constructive technical/fundamental factors',
    },
    bearishFactors: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 4 key risk or headwind factors',
    },
    verifiedFacts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 4 strictly factual observations directly taken from supplied market data',
    },
    modelEstimates: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 3 probabilistic ML projections clearly framed as non-guaranteed estimates',
    },
    fundamentalNote: {
      type: Type.STRING,
      description: 'Concise data-completeness disclosure for retrieved fundamentals',
    },
    limitations: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2 to 3 explicit analytical limitations and educational disclaimer',
    },
  },
  required: [
    'decision',
    'confidenceScore',
    'riskScore',
    'riskLevel',
    'headline',
    'executiveSummary',
    'currentMarketOverview',
    'rationale',
    'technicalAnalysisSummary',
    'fundamentalAnalysisSummary',
    'trendAnalysis',
    'supportResistanceNote',
    'riskAssessment',
    'marketSentimentNote',
    'mlForecastInterpretation',
    'forecastLimitationsNote',
    'shortTermOutlook',
    'mediumTermOutlook',
    'longTermOutlook',
    'conclusion',
    'supportingIndicators',
    'bullishFactors',
    'bearishFactors',
    'verifiedFacts',
    'modelEstimates',
    'fundamentalNote',
    'limitations',
  ],
};

export async function generateAiStockAnalysis(
  quote: StockQuote,
  technical: TechnicalSummary,
  ml: MlPipelineOutput | null,
  fundamentals?: StockFundamentals | null,
  sentimentSummary?: { positive: number; negative: number; neutral: number; headlineSample: string[] } | null,
  options?: { bypassCache?: boolean }
): Promise<AiStockAnalysisReport> {
  const quant = buildQuantitativeScore(quote, technical, ml);
  const bestModel = ml?.models.find((m) => m.modelName === ml.bestModel) || ml?.models[0];

  const fundamentalsBlock = fundamentals
    ? `FUNDAMENTALS (${fundamentals.dataSource}, ${fundamentals.availableFieldsCount} verified fields):
- Industry: ${fundamentals.industry ?? 'Not Available'} | Market Cap: ${fundamentals.marketCap ?? 'Not Available'}
- Valuation: P/E ${fundamentals.trailingPE ?? 'N/A'}, Forward P/E ${fundamentals.forwardPE ?? 'N/A'}, P/B ${fundamentals.priceToBook ?? 'N/A'}, P/S ${fundamentals.priceToSales ?? 'N/A'}, EV/EBITDA ${fundamentals.evToEbitda ?? 'N/A'}, PEG ${fundamentals.pegRatio ?? 'N/A'}, Div Yield ${fundamentals.dividendYieldPct !== null ? `${fundamentals.dividendYieldPct}%` : 'N/A'}
- Income: Revenue ${fundamentals.revenue ?? 'N/A'} (Growth ${fundamentals.revenueGrowthPct ?? 'N/A'}%), Gross Margin ${fundamentals.grossMarginPct ?? 'N/A'}%, Operating Margin ${fundamentals.operatingMarginPct ?? 'N/A'}%, Net Margin ${fundamentals.profitMarginPct ?? 'N/A'}%, EPS ${fundamentals.eps ?? 'N/A'}
- Balance Sheet & Cash Flow: Total Debt ${fundamentals.totalDebt ?? 'N/A'}, Cash ${fundamentals.cashAndEquivalents ?? 'N/A'}, D/E ${fundamentals.debtToEquity ?? 'N/A'}, Operating CF ${fundamentals.operatingCashFlow ?? 'N/A'}, Free CF ${fundamentals.freeCashFlow ?? 'N/A'}
- Returns: ROE ${fundamentals.roePct ?? 'N/A'}%, ROA ${fundamentals.roaPct ?? 'N/A'}%, ROIC ${fundamentals.roicPct ?? 'N/A'}%, Beta ${fundamentals.beta ?? 'N/A'}`
    : 'FUNDAMENTALS: Not available from live feed; do NOT fabricate any financial ratios.';

  const newsBlock = sentimentSummary
    ? `RECENT NEWS SENTIMENT: Positive=${sentimentSummary.positive}, Neutral=${sentimentSummary.neutral}, Negative=${sentimentSummary.negative}. Headlines: ${sentimentSummary.headlineSample.slice(0, 4).join(' | ') || 'None'}`
    : 'RECENT NEWS SENTIMENT: No recent company-specific headlines available.';

  const prompt = `Analyze global equity ${quote.name} (${quote.symbol}, Exchange: ${quote.exchange}, Country: ${quote.country}, Sector: ${quote.sector}, Currency: ${quote.currency}) using ONLY the real market metrics below. Never fabricate unavailable values.

LIVE QUOTE (${quote.fetchedAt}, ${quote.dataSource}, Freshness: ${quote.freshness}):
- Price: ${quote.currency} ${quote.price} (${quote.change >= 0 ? '+' : ''}${quote.change}, ${quote.changePercent}%)
- Day Range: ${quote.currency} ${quote.dayLow} – ${quote.currency} ${quote.dayHigh} | 52W Range: ${quote.fiftyTwoWeekLow ?? 'N/A'} – ${quote.fiftyTwoWeekHigh ?? 'N/A'}
- Volume: ${quote.volume.toLocaleString('en-US')} (20D Avg: ${technical.volumeAnalysis.avgVolume20.toLocaleString('en-US')}, ${technical.volumeAnalysis.volumeRatio}x, ${technical.volumeAnalysis.state})

TECHNICAL INDICATORS:
- Trend: ${technical.trend} (${technical.trendStrength}, ADX14: ${technical.adx14 ?? 'N/A'})
- MAs: SMA20 ${technical.sma20 ?? 'N/A'}, SMA50 ${technical.sma50 ?? 'N/A'}, SMA100 ${technical.sma100 ?? 'N/A'}, SMA200 ${technical.sma200 ?? 'N/A'}, EMA12 ${technical.ema12 ?? 'N/A'}, EMA26 ${technical.ema26 ?? 'N/A'}, EMA50 ${technical.ema50 ?? 'N/A'}, VWAP ${technical.vwap ?? 'N/A'}
- Momentum: RSI14 ${technical.rsi14 ?? 'N/A'} (${technical.rsiState}), StochRSI %K ${technical.stochRsi.k ?? 'N/A'}, CCI20 ${technical.cci20 ?? 'N/A'}, 10D Mom ${technical.momentum10dPct ?? 'N/A'}%, OBV Trend: ${technical.obvTrend}
- MACD(12,26,9): ${technical.macd.line ?? 'N/A'} / Signal ${technical.macd.signal ?? 'N/A'} / Hist ${technical.macd.histogram ?? 'N/A'} (${technical.macd.bias})
- Bollinger(20,2): ${technical.bollinger.lower ?? 'N/A'} – ${technical.bollinger.upper ?? 'N/A'} (%B: ${technical.bollinger.percentB ?? 'N/A'}%)
- ATR14: ${technical.atr14 ?? 'N/A'} | Support: ${technical.supportLevels.join(', ') || 'None'} | Resistance: ${technical.resistanceLevels.join(', ') || 'None'}
- Risk: Ann. Volatility ${technical.annualizedVolatilityPct}%, Max Drawdown ${technical.maxDrawdownPct}%, Sharpe ${technical.sharpeRatio ?? 'N/A'}, Sortino ${technical.sortinoRatio ?? 'N/A'}, 95% 1D VaR ${technical.var95DailyPct ?? 'N/A'}%, Liquidity Risk ${technical.liquidityRisk}

${fundamentalsBlock}

${newsBlock}

ML FORECAST (${ml ? `${ml.engineSource}, ${bestModel?.modelName}` : 'Unavailable'}):
- 7D Target: ${bestModel ? `${quote.currency} ${bestModel.predictedHorizonPrice} (${bestModel.expectedReturnPct}%)` : 'N/A'}
- Held-Out Test Error: ${bestModel ? `MAE ${quote.currency} ${bestModel.mae}, RMSE ${quote.currency} ${bestModel.rmse}, MAPE ${bestModel.mape}%, Dir Acc ${bestModel.directionalAccuracy}%` : 'N/A'}

QUANT BASELINE: Decision ${quant.decision}, Calibrated Confidence ${quant.confidence}%, Risk Score ${quant.riskScore}/100 (${quant.riskLevel}).
Return a single JSON object containing ALL keys: decision, confidenceScore, riskScore, riskLevel, headline, executiveSummary, currentMarketOverview, rationale, technicalAnalysisSummary, fundamentalAnalysisSummary, trendAnalysis, supportResistanceNote, riskAssessment, marketSentimentNote, mlForecastInterpretation, forecastLimitationsNote, shortTermOutlook, mediumTermOutlook, longTermOutlook, conclusion, supportingIndicators, bullishFactors, bearishFactors, verifiedFacts, modelEstimates, fundamentalNote, limitations.
Explicitly separate verifiedFacts from modelEstimates. Keep confidenceScore between 40 and 82 and riskScore between 10 and 96. Never guarantee returns.`;

  const cacheKey = `analyze:${quote.symbol.toUpperCase()}:${quote.exchange.toUpperCase()}`;

  const execResult = await executeStructuredAiTask<Omit<AiStockAnalysisReport, 'cached' | 'stale' | 'providersTried'>>({
    cacheKey,
    systemInstruction:
      'You are a disciplined institutional equity research analyst for MarketMinds writing transparent quantitative briefs across global stock exchanges. Cite only supplied market metrics. Explicitly distinguish verified exchange facts from probabilistic ML estimates and never invent missing financial statements.',
    prompt,
    geminiResponseSchema: ANALYSIS_RESPONSE_SCHEMA,
    bypassCache: options?.bypassCache,
    allowStaleFallback: !options?.bypassCache,
    parseAndNormalize: (parsed, meta) => {
      const validDecisions = new Set(['BUY', 'SELL', 'HOLD', 'WAIT']);
      const validRisks = new Set(['LOW', 'MODERATE', 'HIGH']);

      const bullish = Array.isArray(parsed.bullishFactors)
        ? parsed.bullishFactors.map(String).filter(Boolean).slice(0, 5)
        : [];
      const bearish = Array.isArray(parsed.bearishFactors)
        ? parsed.bearishFactors.map(String).filter(Boolean).slice(0, 5)
        : [];
      const verifiedFacts = Array.isArray(parsed.verifiedFacts)
        ? parsed.verifiedFacts.map(String).filter(Boolean).slice(0, 5)
        : [
            `${quote.symbol} (${quote.exchange}) last traded at ${quote.currency} ${quote.price} (${quote.changePercent}%).`,
            `Annualized historical volatility is ${technical.annualizedVolatilityPct}% with ${technical.maxDrawdownPct}% max drawdown.`,
          ];
      const modelEstimates = Array.isArray(parsed.modelEstimates)
        ? parsed.modelEstimates.map(String).filter(Boolean).slice(0, 4)
        : bestModel
          ? [
              `${bestModel.modelName} estimates a 7-session point projection of ${quote.currency} ${bestModel.predictedHorizonPrice} (held-out MAPE ${bestModel.mape}%).`,
            ]
          : ['Quantitative ML forecast unavailable for this run.'];
      const limitations = Array.isArray(parsed.limitations)
        ? parsed.limitations.map(String).filter(Boolean).slice(0, 4)
        : [
            'This analysis is generated for educational and research purposes only and is not personalized financial or investment advice.',
          ];

      const rationale = String(parsed.rationale || parsed.executiveSummary || '');
      const executiveSummary = String(parsed.executiveSummary || parsed.rationale || parsed.headline || '');
      const mlInterp = String(
        parsed.mlForecastInterpretation ||
          (bestModel
            ? `${bestModel.modelName} achieved held-out MAPE of ${bestModel.mape}% and ${bestModel.directionalAccuracy}% directional accuracy, projecting ${quote.currency} ${bestModel.predictedHorizonPrice} over 7 sessions.`
            : 'ML forecast was unavailable for this equity.')
      );

      return {
        decision: validDecisions.has(parsed.decision) ? parsed.decision : quant.decision,
        confidenceScore: Math.max(
          35,
          Math.min(82, Math.round(Number(parsed.confidenceScore) || quant.confidence))
        ),
        riskScore: Math.max(
          1,
          Math.min(100, Math.round(Number(parsed.riskScore) || quant.riskScore))
        ),
        riskLevel: validRisks.has(parsed.riskLevel) ? parsed.riskLevel : quant.riskLevel,
        headline: String(parsed.headline || `${quote.symbol} (${quote.exchange}) research outlook`),
        executiveSummary,
        currentMarketOverview: String(
          parsed.currentMarketOverview ||
            `${quote.name} (${quote.symbol}) trades at ${quote.currency} ${quote.price} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent}%) on ${quote.exchange} with volume at ${technical.volumeAnalysis.volumeRatio}x the 20-day average.`
        ),
        rationale,
        technicalAnalysisSummary: String(
          parsed.technicalAnalysisSummary ||
            `${quote.symbol} trades in a ${technical.trend} regime with RSI(14) at ${technical.rsi14 ?? 'N/A'} and ${technical.macd.bias}.`
        ),
        fundamentalAnalysisSummary: String(
          parsed.fundamentalAnalysisSummary ||
            fundamentals?.note ||
            'Verify full quarterly filings on official exchange disclosures.'
        ),
        trendAnalysis: String(
          parsed.trendAnalysis ||
            `Primary regime is ${technical.trend} (${technical.trendStrength}, ADX14: ${technical.adx14 ?? 'N/A'}) relative to SMA20/SMA50/SMA200.`
        ),
        supportResistanceNote: String(
          parsed.supportResistanceNote ||
            `Nearest support: ${technical.supportLevels[0] ?? 'N/A'}; nearest resistance: ${technical.resistanceLevels[0] ?? 'N/A'}.`
        ),
        riskAssessment: String(
          parsed.riskAssessment ||
            `Annualized volatility is ${technical.annualizedVolatilityPct}% with ${technical.maxDrawdownPct}% max drawdown (${quant.riskLevel} risk).`
        ),
        marketSentimentNote: String(
          parsed.marketSentimentNote ||
            'Recent market sentiment reflects sector price action and public financial headlines.'
        ),
        mlForecastInterpretation: mlInterp,
        forecastLimitationsNote: String(
          parsed.forecastLimitationsNote ||
            'ML projections reflect historical price-volume relationships and widen substantially in uncertainty over longer horizons.'
        ),
        shortTermOutlook: String(
          parsed.shortTermOutlook || 'Short-term price action tracks RSI/MACD momentum and rolling VWAP.'
        ),
        mediumTermOutlook: String(
          parsed.mediumTermOutlook || 'Medium-term posture remains anchored to 20D/50D moving average alignment.'
        ),
        longTermOutlook: String(
          parsed.longTermOutlook ||
            'Long-term conviction depends on verified earnings durability and balance sheet strength.'
        ),
        conclusion: String(
          parsed.conclusion ||
            `${quote.symbol} carries a ${validDecisions.has(parsed.decision) ? parsed.decision : quant.decision} research stance; monitor confirmed support/resistance breaks and upcoming financial disclosures.`
        ),
        supportingIndicators: Array.isArray(parsed.supportingIndicators)
          ? parsed.supportingIndicators.map(String).filter(Boolean).slice(0, 6)
          : quant.signals,
        bullishFactors: bullish,
        bearishFactors: bearish,
        keyStrengths: bullish,
        keyRisks: bearish,
        bullishScenario: bullish[0] || String(parsed.shortTermOutlook || ''),
        bearishScenario: bearish[0] || String(parsed.riskAssessment || ''),
        verifiedFacts,
        modelEstimates,
        aiInterpretations: [
          ...modelEstimates,
          ...(Array.isArray(parsed.supportingIndicators) ? parsed.supportingIndicators.slice(0, 2) : []),
        ].slice(0, 5),
        fundamentalNote: String(
          parsed.fundamentalNote ||
            fundamentals?.note ||
            'Detailed quarterly fundamentals should be verified against official exchange filings.'
        ),
        limitations,
        disclaimer:
          limitations[0] ||
          'This research brief is generated for educational and quantitative analysis purposes only and is not personalized financial or investment advice.',
        provider: meta.provider,
        providerLabel: meta.providerLabel,
        model: meta.model,
        modelStatus: `Active · ${meta.providerLabel} (${meta.model}) + Out-of-Sample Quant ML`,
        aiEngine: meta.model,
        generatedAt: meta.generatedAt,
        generated_at: meta.generatedAt,
        requestId: meta.requestId,
      };
    },
  });

  return {
    ...execResult.data,
    cached: execResult.cached,
    stale: execResult.stale,
    providersTried: execResult.providersTried,
  };
}
