import { Type } from '@google/genai';
import type { OhlcvBar, StockFundamentals, StockQuote } from './marketDataService.ts';
import type { TechnicalSummary } from './technicalIndicators.ts';
import type { NewsArticle } from './newsService.ts';
import {
  AllAiProvidersFailedError,
  executeStructuredAiTask,
  type AiProviderAttempt,
} from './ai/providerClient.ts';

export interface ObservedMarketAnomaly {
  date: string;
  eventType:
    | 'Unusual Rally'
    | 'Sharp Sell-Off'
    | 'Volume Surge'
    | 'Opening Gap Up'
    | 'Opening Gap Down'
    | 'Range Breakout'
    | 'Range Breakdown';
  closePrice: number;
  dailyReturnPct: number;
  volumeRatio: number;
  zScore: number;
  observation: string;
}

export interface ReverseResearchTimelineItem {
  date: string;
  eventType: string;
  observation: string;
  evidenceType: 'Verified Market Fact' | 'Published News' | 'Plausible Explanation';
  source: string;
  url: string | null;
}

export interface ReverseResearchHypothesis {
  hypothesis: string;
  confidence: 'High' | 'Moderate' | 'Low';
  supportingEvidence: string;
  caveats: string;
}

export interface ReverseResearchSource {
  title: string;
  publisher: string;
  url: string;
  publishedAt: string;
  sentiment: string;
}

export interface ReverseResearchReport {
  researchType: 'reverse-research';
  symbol: string;
  exchange: string;
  companyName: string;
  currency: string;
  lookbackDays: number;
  periodStart: string;
  periodEnd: string;
  researchQuestion: string;
  observedMarketMovement: {
    summary: string;
    periodReturnPct: number;
    periodHigh: number;
    periodLow: number;
    maxDrawdownPct: number;
    avgDailyVolume: number;
    latestVolumeRatio: number;
    anomaliesDetected: number;
  };
  anomalies: ObservedMarketAnomaly[];
  timelineOfEvents: ReverseResearchTimelineItem[];
  newsAndCorporateDevelopments: string[];
  fundamentalEvidence: string[];
  technicalEvidence: string[];
  possibleReasonsBehindMovement: ReverseResearchHypothesis[];
  bullishEvidence: string[];
  bearishEvidence: string[];
  contradictoryEvidence: string[];
  missingInformation: string[];
  finalResearchFindings: string;
  sources: ReverseResearchSource[];
  aiStatus: 'success' | 'cached' | 'unavailable';
  aiProvider: string | null;
  aiModel: string | null;
  generatedAt: string;
  generated_at: string;
  cached: boolean;
  stale: boolean;
  requestId: string | null;
  providersTried: AiProviderAttempt[];
  aiError?: string;
}

export function detectMarketAnomalies(
  history: OhlcvBar[],
  quote: StockQuote,
  lookbackDays = 90
): {
  windowBars: OhlcvBar[];
  periodReturnPct: number;
  periodHigh: number;
  periodLow: number;
  periodMaxDrawdownPct: number;
  avgVolume: number;
  latestVolumeRatio: number;
  anomalies: ObservedMarketAnomaly[];
} {
  const safeLookback = Math.min(Math.max(lookbackDays, 20), 252);
  const windowBars = history.slice(-Math.min(history.length, safeLookback));
  if (windowBars.length < 5) {
    return {
      windowBars,
      periodReturnPct: quote.changePercent || 0,
      periodHigh: quote.dayHigh || quote.price,
      periodLow: quote.dayLow || quote.price,
      periodMaxDrawdownPct: 0,
      avgVolume: quote.volume || 0,
      latestVolumeRatio: 1,
      anomalies: [],
    };
  }

  const firstClose = windowBars[0].close || quote.price;
  const lastClose = windowBars[windowBars.length - 1].close || quote.price;
  const periodReturnPct = Number((((lastClose - firstClose) / firstClose) * 100).toFixed(2));

  let periodHigh = -Infinity;
  let periodLow = Infinity;
  let peak = windowBars[0].close;
  let maxDd = 0;
  let volSum = 0;

  const dailyReturns: number[] = [];
  for (let i = 0; i < windowBars.length; i += 1) {
    const bar = windowBars[i];
    if (bar.high > periodHigh) periodHigh = bar.high;
    if (bar.low < periodLow) periodLow = bar.low;
    if (bar.close > peak) peak = bar.close;
    const dd = peak > 0 ? ((peak - bar.close) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
    volSum += bar.volume || 0;
    if (i > 0 && windowBars[i - 1].close > 0) {
      dailyReturns.push(((bar.close - windowBars[i - 1].close) / windowBars[i - 1].close) * 100);
    }
  }

  const avgVolume = Math.round(volSum / windowBars.length);
  const meanRet =
    dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
      : 0;
  const stdRet =
    dailyReturns.length > 1
      ? Math.sqrt(
          dailyReturns.reduce((acc, r) => acc + Math.pow(r - meanRet, 2), 0) /
            (dailyReturns.length - 1)
        )
      : 1;

  const anomalies: ObservedMarketAnomaly[] = [];

  for (let i = 1; i < windowBars.length; i += 1) {
    const prev = windowBars[i - 1];
    const bar = windowBars[i];
    if (!prev.close || prev.close <= 0) continue;

    const retPct = ((bar.close - prev.close) / prev.close) * 100;
    const gapPct = ((bar.open - prev.close) / prev.close) * 100;
    const zScore = stdRet > 0.05 ? (retPct - meanRet) / stdRet : 0;

    // 20-day trailing average volume
    const trailingStart = Math.max(0, i - 20);
    const trailingSlice = windowBars.slice(trailingStart, i);
    const trailingAvgVol =
      trailingSlice.length > 0
        ? trailingSlice.reduce((s, b) => s + (b.volume || 0), 0) / trailingSlice.length
        : avgVolume;
    const volRatio = trailingAvgVol > 0 ? bar.volume / trailingAvgVol : 1;

    // 20-day trailing high/low
    const trailingHigh =
      trailingSlice.length >= 10
        ? Math.max(...trailingSlice.map((b) => b.high))
        : Infinity;
    const trailingLow =
      trailingSlice.length >= 10
        ? Math.min(...trailingSlice.map((b) => b.low))
        : -Infinity;

    let eventType: ObservedMarketAnomaly['eventType'] | null = null;
    if (zScore >= 1.8 || retPct >= 4.0) {
      eventType = 'Unusual Rally';
    } else if (zScore <= -1.8 || retPct <= -4.0) {
      eventType = 'Sharp Sell-Off';
    } else if (gapPct >= 2.5) {
      eventType = 'Opening Gap Up';
    } else if (gapPct <= -2.5) {
      eventType = 'Opening Gap Down';
    } else if (volRatio >= 2.0) {
      eventType = 'Volume Surge';
    } else if (bar.close > trailingHigh && volRatio >= 1.45) {
      eventType = 'Range Breakout';
    } else if (bar.close < trailingLow && volRatio >= 1.45) {
      eventType = 'Range Breakdown';
    }

    if (eventType) {
      anomalies.push({
        date: bar.date,
        eventType,
        closePrice: Number(bar.close.toFixed(2)),
        dailyReturnPct: Number(retPct.toFixed(2)),
        volumeRatio: Number(volRatio.toFixed(2)),
        zScore: Number(zScore.toFixed(2)),
        observation: `${eventType}: closed at ${quote.currency} ${bar.close.toFixed(2)} (${retPct >= 0 ? '+' : ''}${retPct.toFixed(2)}%, ${volRatio.toFixed(2)}x 20D avg volume${Math.abs(gapPct) >= 1.5 ? `, open gap ${gapPct >= 0 ? '+' : ''}${gapPct.toFixed(2)}%` : ''}).`,
      });
    }
  }

  // Keep up to 10 most statistically significant / recent anomalies, sorted chronologically
  const ranked = [...anomalies]
    .sort((a, b) => Math.abs(b.zScore) + b.volumeRatio * 0.5 - (Math.abs(a.zScore) + a.volumeRatio * 0.5))
    .slice(0, 10)
    .sort((a, b) => a.date.localeCompare(b.date));

  const latestBar = windowBars[windowBars.length - 1];
  const latestVolumeRatio = avgVolume > 0 ? Number(((latestBar.volume || 0) / avgVolume).toFixed(2)) : 1;

  return {
    windowBars,
    periodReturnPct,
    periodHigh: Number(periodHigh.toFixed(2)),
    periodLow: Number(periodLow.toFixed(2)),
    periodMaxDrawdownPct: Number(maxDd.toFixed(2)),
    avgVolume,
    latestVolumeRatio,
    anomalies: ranked,
  };
}

const REVERSE_RESEARCH_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    researchQuestion: {
      type: Type.STRING,
      description: 'Sharp forensic research question framing why the stock moved as observed over the investigation window',
    },
    observedMovementSummary: {
      type: Type.STRING,
      description: '2-3 sentence strictly factual summary of observed price return, drawdown, volume behavior, and key sessions',
    },
    newsAndCorporateDevelopments: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Verified news or corporate developments cited strictly from supplied headlines with dates/sources; if none, state clearly',
    },
    fundamentalEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3-5 verified fundamental evidence points from supplied financial metrics',
    },
    technicalEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3-5 verified technical & volume evidence points from supplied OHLCV and indicators',
    },
    possibleReasonsBehindMovement: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          hypothesis: { type: Type.STRING },
          confidence: { type: Type.STRING, description: 'High, Moderate, or Low' },
          supportingEvidence: { type: Type.STRING },
          caveats: { type: Type.STRING },
        },
        required: ['hypothesis', 'confidence', 'supportingEvidence', 'caveats'],
      },
      description: '2-4 plausible explanations linking observed market movement to verified facts, clearly noting caveats',
    },
    bullishEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2-4 verified bullish evidence points',
    },
    bearishEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2-4 verified bearish evidence points',
    },
    contradictoryEvidence: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2-3 pieces of conflicting or mixed evidence (e.g. strong margins vs weak price momentum)',
    },
    missingInformation: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '2-4 explicit unknowns or unverified data gaps not present in the supplied feed',
    },
    finalResearchFindings: {
      type: Type.STRING,
      description: '3-4 sentence evidence-first synthesis distinguishing verified facts from plausible explanations and unknowns',
    },
  },
  required: [
    'researchQuestion',
    'observedMovementSummary',
    'newsAndCorporateDevelopments',
    'fundamentalEvidence',
    'technicalEvidence',
    'possibleReasonsBehindMovement',
    'bullishEvidence',
    'bearishEvidence',
    'contradictoryEvidence',
    'missingInformation',
    'finalResearchFindings',
  ],
};

function buildDeterministicEvidence(
  quote: StockQuote,
  technical: TechnicalSummary,
  fundamentals: StockFundamentals | null,
  newsArticles: NewsArticle[],
  stats: ReturnType<typeof detectMarketAnomalies>
) {
  const periodStart = stats.windowBars[0]?.date || new Date().toISOString().slice(0, 10);
  const periodEnd =
    stats.windowBars[stats.windowBars.length - 1]?.date || new Date().toISOString().slice(0, 10);

  const directionWord =
    stats.periodReturnPct >= 4
      ? `gained ${stats.periodReturnPct}%`
      : stats.periodReturnPct <= -4
        ? `declined ${Math.abs(stats.periodReturnPct)}%`
        : `traded ${stats.periodReturnPct >= 0 ? 'up' : 'down'} ${Math.abs(stats.periodReturnPct)}%`;

  const researchQuestion = `What verified market, fundamental, and news evidence explains why ${quote.name} (${quote.symbol}, ${quote.exchange}) ${directionWord} between ${periodStart} and ${periodEnd}?`;

  const observedSummary = `Over ${stats.windowBars.length} sessions (${periodStart} to ${periodEnd}), ${quote.symbol} moved ${stats.periodReturnPct >= 0 ? '+' : ''}${stats.periodReturnPct}% between ${quote.currency} ${stats.periodLow} and ${quote.currency} ${stats.periodHigh}, with a peak-to-trough drawdown of ${stats.periodMaxDrawdownPct}% and ${stats.anomalies.length} statistically notable price/volume sessions detected.`;

  const timelineOfEvents: ReverseResearchTimelineItem[] = [
    ...stats.anomalies.map((a) => ({
      date: a.date,
      eventType: a.eventType,
      observation: a.observation,
      evidenceType: 'Verified Market Fact' as const,
      source: quote.dataSource,
      url: null,
    })),
    ...newsArticles.slice(0, 10).map((art) => ({
      date: (art.publishedAt || '').slice(0, 10) || periodEnd,
      eventType: `News (${art.sentiment})`,
      observation: `${art.title}${art.summary ? ` — ${art.summary}` : ''}`,
      evidenceType: 'Published News' as const,
      source: art.source,
      url: art.link,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const fundamentalEvidence: string[] = [];
  if (fundamentals && fundamentals.availableFieldsCount > 0) {
    if (fundamentals.trailingPE !== null) {
      fundamentalEvidence.push(
        `Trailing P/E stands at ${fundamentals.trailingPE}x${fundamentals.forwardPE ? ` (Forward P/E: ${fundamentals.forwardPE}x)` : ''}.`
      );
    }
    if (fundamentals.revenueGrowthPct !== null || fundamentals.profitMarginPct !== null) {
      fundamentalEvidence.push(
        `Reported revenue growth is ${fundamentals.revenueGrowthPct ?? 'N/A'}% with net profit margin of ${fundamentals.profitMarginPct ?? 'N/A'}%.`
      );
    }
    if (fundamentals.roePct !== null || fundamentals.debtToEquity !== null) {
      fundamentalEvidence.push(
        `Return on equity (ROE) is ${fundamentals.roePct ?? 'N/A'}% alongside Debt/Equity of ${fundamentals.debtToEquity ?? 'N/A'}.`
      );
    }
    if (fundamentals.freeCashFlow !== null) {
      fundamentalEvidence.push(`Latest reported Free Cash Flow: ${quote.currency} ${fundamentals.freeCashFlow.toLocaleString('en-US')}.`);
    }
  }
  if (fundamentalEvidence.length === 0) {
    fundamentalEvidence.push(
      `Extended financial statements were not returned by the live exchange feed for ${quote.symbol} (${quote.exchange}).`
    );
  }

  const technicalEvidence: string[] = [
    `Primary trend is ${technical.trend} (${technical.trendStrength}, ADX14: ${technical.adx14 ?? 'N/A'}).`,
    `RSI(14) reads ${technical.rsi14 ?? 'N/A'} (${technical.rsiState}); MACD bias is ${technical.macd.bias}.`,
    `Latest volume ratio is ${technical.volumeAnalysis.volumeRatio}x 20-day average (${technical.volumeAnalysis.state}); OBV trend is ${technical.obvTrend}.`,
    `Annualized volatility is ${technical.annualizedVolatilityPct}% with historical max drawdown of ${technical.maxDrawdownPct}%.`,
  ];

  const newsDevelopments =
    newsArticles.length > 0
      ? newsArticles
          .slice(0, 8)
          .map(
            (a) =>
              `[${(a.publishedAt || '').slice(0, 10)}] ${a.title} (${a.source}, Sentiment: ${a.sentiment})`
          )
      : [
          `No recent company-specific financial headlines were returned by configured news providers for ${quote.symbol} during this check.`,
        ];

  const sources: ReverseResearchSource[] = newsArticles.slice(0, 12).map((a) => ({
    title: a.title,
    publisher: a.source,
    url: a.link,
    publishedAt: a.publishedAt,
    sentiment: a.sentiment,
  }));

  return {
    periodStart,
    periodEnd,
    researchQuestion,
    observedSummary,
    timelineOfEvents,
    fundamentalEvidence,
    technicalEvidence,
    newsDevelopments,
    sources,
  };
}

export async function runReverseResearchInvestigation(params: {
  quote: StockQuote;
  history: OhlcvBar[];
  technical: TechnicalSummary;
  fundamentals: StockFundamentals | null;
  newsArticles: NewsArticle[];
  lookbackDays?: number;
  bypassCache?: boolean;
}): Promise<ReverseResearchReport> {
  const lookbackDays = params.lookbackDays ?? 90;
  const stats = detectMarketAnomalies(params.history, params.quote, lookbackDays);
  const det = buildDeterministicEvidence(
    params.quote,
    params.technical,
    params.fundamentals,
    params.newsArticles,
    stats
  );

  const anomalyLines =
    stats.anomalies.length > 0
      ? stats.anomalies.map((a) => `- ${a.date} | ${a.observation} (z=${a.zScore})`).join('\n')
      : '- No extreme >1.8 sigma single-day outliers detected in the lookback window.';

  const newsLines =
    params.newsArticles.length > 0
      ? params.newsArticles
          .slice(0, 10)
          .map(
            (a) =>
              `- [${(a.publishedAt || '').slice(0, 10)}] ${a.title} (Source: ${a.source}, Sentiment: ${a.sentiment})`
          )
          .join('\n')
      : '- No verified external news articles available for this symbol right now.';

  const prompt = `Conduct an EVIDENCE-FIRST REVERSE RESEARCH investigation into ${params.quote.name} (${params.quote.symbol}, ${params.quote.exchange}, ${params.quote.country}).

Your job is DIFFERENT from a generic buy/sell summary: start from the OBSERVED MARKET MOVEMENT and investigate WHY price and volume behaved this way using ONLY the verified evidence below. Explicitly distinguish verified facts, plausible hypotheses, contradictory signals, and missing information. NEVER fabricate news events, earnings dates, analyst upgrades, or URLs.

INVESTIGATION WINDOW: ${det.periodStart} to ${det.periodEnd} (${stats.windowBars.length} sessions)
OBSERVED MOVEMENT:
- Period Return: ${stats.periodReturnPct >= 0 ? '+' : ''}${stats.periodReturnPct}%
- Latest Close: ${params.quote.currency} ${params.quote.price} (1D: ${params.quote.changePercent}%)
- Period Range: ${params.quote.currency} ${stats.periodLow} – ${params.quote.currency} ${stats.periodHigh} | Period Max Drawdown: ${stats.periodMaxDrawdownPct}%
- Avg Daily Volume: ${stats.avgVolume.toLocaleString('en-US')} | Latest Volume Ratio: ${stats.latestVolumeRatio}x

DETECTED PRICE & VOLUME ANOMALIES (from real OHLCV):
${anomalyLines}

VERIFIED TECHNICAL CONTEXT:
${det.technicalEvidence.map((t) => `- ${t}`).join('\n')}
- Support Levels: ${params.technical.supportLevels.join(', ') || 'None'} | Resistance Levels: ${params.technical.resistanceLevels.join(', ') || 'None'}
- Breakout Status: ${params.technical.breakoutLevels?.status || 'N/A'}

VERIFIED FUNDAMENTAL EVIDENCE:
${det.fundamentalEvidence.map((f) => `- ${f}`).join('\n')}
- Next Earnings Date: ${params.fundamentals?.nextEarningsDate || 'Not Provided'}

RETRIEVED FINANCIAL NEWS & HEADLINES:
${newsLines}

Return a single JSON object with ALL keys: researchQuestion, observedMovementSummary, newsAndCorporateDevelopments, fundamentalEvidence, technicalEvidence, possibleReasonsBehindMovement (array of {hypothesis, confidence, supportingEvidence, caveats}), bullishEvidence, bearishEvidence, contradictoryEvidence, missingInformation, finalResearchFindings.
If news coverage is sparse or does not align with a price anomaly date, explicitly list that under missingInformation rather than inventing a cause.`;

  const cacheKey = `reverse-research:${params.quote.symbol.toUpperCase()}:${params.quote.exchange.toUpperCase()}:${lookbackDays}`;

  try {
    const aiRes = await executeStructuredAiTask<any>({
      cacheKey,
      systemInstruction:
        'You are an institutional forensic equity researcher conducting evidence-first Reverse Research for MarketMinds. You start from observed price/volume anomalies and work backward using strictly supplied OHLCV, fundamental, and news evidence. Separate verified facts from plausible hypotheses and explicitly state unknowns. Never fabricate events, dates, or citations.',
      prompt,
      geminiResponseSchema: REVERSE_RESEARCH_SCHEMA,
      bypassCache: params.bypassCache,
      allowStaleFallback: !params.bypassCache,
      parseAndNormalize: (parsed) => parsed,
    });

    const p = aiRes.data || {};
    const validConf = new Set(['High', 'Moderate', 'Low']);
    const hypotheses: ReverseResearchHypothesis[] = Array.isArray(p.possibleReasonsBehindMovement)
      ? p.possibleReasonsBehindMovement.slice(0, 5).map((item: any) => ({
          hypothesis: String(item?.hypothesis || 'Unclassified market driver'),
          confidence: validConf.has(item?.confidence) ? item.confidence : 'Low',
          supportingEvidence: String(item?.supportingEvidence || 'Derived from observed market data.'),
          caveats: String(item?.caveats || 'Correlation does not confirm single-factor causation.'),
        }))
      : [];

    // Enrich timeline with top AI hypotheses clearly tagged as Plausible Explanation
    const combinedTimeline: ReverseResearchTimelineItem[] = [
      ...det.timelineOfEvents,
    ].slice(0, 18);

    return {
      researchType: 'reverse-research',
      symbol: params.quote.symbol,
      exchange: params.quote.exchange,
      companyName: params.quote.name,
      currency: params.quote.currency,
      lookbackDays,
      periodStart: det.periodStart,
      periodEnd: det.periodEnd,
      researchQuestion: String(p.researchQuestion || det.researchQuestion),
      observedMarketMovement: {
        summary: String(p.observedMovementSummary || det.observedSummary),
        periodReturnPct: stats.periodReturnPct,
        periodHigh: stats.periodHigh,
        periodLow: stats.periodLow,
        maxDrawdownPct: stats.periodMaxDrawdownPct,
        avgDailyVolume: stats.avgVolume,
        latestVolumeRatio: stats.latestVolumeRatio,
        anomaliesDetected: stats.anomalies.length,
      },
      anomalies: stats.anomalies,
      timelineOfEvents: combinedTimeline,
      newsAndCorporateDevelopments:
        Array.isArray(p.newsAndCorporateDevelopments) && p.newsAndCorporateDevelopments.length > 0
          ? p.newsAndCorporateDevelopments.map(String).slice(0, 8)
          : det.newsDevelopments,
      fundamentalEvidence:
        Array.isArray(p.fundamentalEvidence) && p.fundamentalEvidence.length > 0
          ? p.fundamentalEvidence.map(String).slice(0, 6)
          : det.fundamentalEvidence,
      technicalEvidence:
        Array.isArray(p.technicalEvidence) && p.technicalEvidence.length > 0
          ? p.technicalEvidence.map(String).slice(0, 6)
          : det.technicalEvidence,
      possibleReasonsBehindMovement: hypotheses,
      bullishEvidence: Array.isArray(p.bullishEvidence)
        ? p.bullishEvidence.map(String).slice(0, 5)
        : [],
      bearishEvidence: Array.isArray(p.bearishEvidence)
        ? p.bearishEvidence.map(String).slice(0, 5)
        : [],
      contradictoryEvidence: Array.isArray(p.contradictoryEvidence)
        ? p.contradictoryEvidence.map(String).slice(0, 4)
        : [],
      missingInformation: Array.isArray(p.missingInformation)
        ? p.missingInformation.map(String).slice(0, 5)
        : [
            'Intraday order-book flow, institutional block-trade identities, and private management commentary are not included in public exchange feeds.',
          ],
      finalResearchFindings: String(
        p.finalResearchFindings ||
          'Evidence review completed from verified OHLCV anomalies, fundamental disclosures, and syndicated headlines.'
      ),
      sources: det.sources,
      aiStatus: aiRes.cached ? 'cached' : 'success',
      aiProvider: aiRes.providerLabel,
      aiModel: aiRes.model,
      generatedAt: aiRes.generatedAt,
      generated_at: aiRes.generatedAt,
      cached: aiRes.cached,
      stale: aiRes.stale,
      requestId: aiRes.requestId,
      providersTried: aiRes.providersTried,
    };
  } catch (err: any) {
    const nowIso = new Date().toISOString();
    const providersTried =
      err instanceof AllAiProvidersFailedError ? err.providersTried : [];
    const requestId =
      err instanceof AllAiProvidersFailedError ? err.requestId : null;

    // Never fabricate AI conclusions when all providers fail — return 100% verified quantitative & news evidence!
    return {
      researchType: 'reverse-research',
      symbol: params.quote.symbol,
      exchange: params.quote.exchange,
      companyName: params.quote.name,
      currency: params.quote.currency,
      lookbackDays,
      periodStart: det.periodStart,
      periodEnd: det.periodEnd,
      researchQuestion: det.researchQuestion,
      observedMarketMovement: {
        summary: det.observedSummary,
        periodReturnPct: stats.periodReturnPct,
        periodHigh: stats.periodHigh,
        periodLow: stats.periodLow,
        maxDrawdownPct: stats.periodMaxDrawdownPct,
        avgDailyVolume: stats.avgVolume,
        latestVolumeRatio: stats.latestVolumeRatio,
        anomaliesDetected: stats.anomalies.length,
      },
      anomalies: stats.anomalies,
      timelineOfEvents: det.timelineOfEvents.slice(0, 18),
      newsAndCorporateDevelopments: det.newsDevelopments,
      fundamentalEvidence: det.fundamentalEvidence,
      technicalEvidence: det.technicalEvidence,
      possibleReasonsBehindMovement: [],
      bullishEvidence: [],
      bearishEvidence: [],
      contradictoryEvidence: [],
      missingInformation: [
        'AI causal synthesis is temporarily unavailable; only verified OHLCV anomalies, fundamentals, and published news citations are shown above.',
        'Click Retry Reverse Research to synthesize cross-evidence explanations once an AI provider responds.',
      ],
      finalResearchFindings:
        'AI narrative synthesis is temporarily unavailable. Verified price/volume anomaly dates, technical evidence, fundamental metrics, and external news citations remain fully intact above for manual review.',
      sources: det.sources,
      aiStatus: 'unavailable',
      aiProvider: null,
      aiModel: null,
      generatedAt: nowIso,
      generated_at: nowIso,
      cached: false,
      stale: false,
      requestId,
      providersTried,
      aiError: err?.message || 'AI synthesis providers are temporarily unavailable.',
    };
  }
}
