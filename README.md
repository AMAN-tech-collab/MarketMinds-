# MarketMinds — Global AI Stock Intelligence

**Think Smarter. Analyze Deeper. Invest Informed.**

MarketMinds is a full-stack global equity research, technical studio, out-of-sample machine learning forecasting, and multi-currency portfolio analytics platform spanning 16 international exchanges across the US, India, Europe, and Asia-Pacific.

---

## Core Capabilities

- **16 Worldwide Exchanges**: Live market quotes, historical OHLCV candles, and search across NYSE, NASDAQ, AMEX, NSE, BSE, LSE, TSE, HKEX, SSE, SZSE, TSX, XETRA, Frankfurt, Euronext Paris, ASX, KRX, and SGX.
- **Interactive AI Equity Research Terminal**:
  - Real-time Server-Sent Events (SSE) 7-stage research pipeline (`/api/analysis/stream`) with graceful partial-data handling and transparent source attribution.
  - Multi-mode interactive chart (`Area`, `Line`, `Candlesticks`, `OHLC`) across `1D`, `1W`, `1M`, `3M`, `6M`, `1Y`, `5Y`, and `MAX` timeframes with SMA 20/50/100/200, EMA 12/26/50, VWAP, Bollinger Bands, Support/Resistance lines, Volume, RSI, MACD, zoom, drag-to-pan, and fullscreen view.
  - Full technical breakdown: Trend Direction, SMA/EMA stack, RSI(14), MACD(12,26,9), Bollinger Bands(20,2), Stochastic RSI, ADX(14), CCI(20), OBV, ATR(14), Fibonacci Retracements, Pivot Points, Breakout Levels, Volatility, Sortino Ratio, VaR(95%), and Max Drawdown.
  - Fundamental analysis, annual & quarterly income statement trends, valuation multiples, and live peer-relative valuation comparisons.
  - Out-of-sample ML forecasting across `1D`, `7D`, `30D`, `90D`, and `180D` horizons using chronological 80/20 train/test splits (`Ridge Linear Regression`, `Random Forest`, `Gradient Boosted Trees`) with explicit MAE, RMSE, MAPE, R², directional accuracy, and Actual vs Predicted validation charts.
  - **Dual AI Provider Synthesis (`Google Gemini` primary + `OpenAI` fallback)**:
    - Configurable via `AI_PRIMARY_PROVIDER`, `AI_FALLBACK_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, and `AI_REQUEST_TIMEOUT_MS` (backend-only; API keys are never exposed to the browser).
    - Per-model circuit breakers, jittered exponential backoff on transient 5xx/timeouts, immediate failover on 429/401/403, request deduplication, stale-while-error narrative caching with original timestamps, and in-place **Retry AI Synthesis** (`POST /api/analysis/synthesize`) without losing quantitative metrics.
  - **Two Distinct Research Modes**:
    - **Analyze Stock** (`POST /api/analysis/analyze`, SSE `GET /api/analysis/stream`): Forward institutional equity analysis combining OHLCV, technicals, fundamentals, ML walk-forward validation, peers, news sentiment, and Dual AI synthesis.
    - **Reverse Research** (`POST /api/analysis/reverse-research`): Evidence-first forensic investigation that starts from statistically significant OHLCV price/volume/gap anomalies and correlates them with dated financial news, fundamentals, technical signals, contradictory evidence, and verified dated sources.
- **Global Screener, Side-by-Side Comparison, Multi-Currency Portfolio, Watchlists & Risk Analytics**.
- **Resilient Multi-Provider Global Financial News**:
  - Modular provider chain supporting optional commercial APIs (`FINNHUB_API_KEY`, `ALPHAVANTAGE_API_KEY`, `MARKETAUX_API_KEY`, `GNEWS_API_KEY`) and built-in legitimate financial feeds (Yahoo Finance Global News API, CNBC Markets RSS, Economic Times India NSE/BSE RSS, BBC Business RSS, and Google News RSS tertiary fallback).
  - Limited exponential-backoff retries, per-provider circuit breakers, request deduplication, partial-result failover, and two-layer stale-while-error caching (`NEWS_CACHE_TTL_MS`, `NEWS_STALE_TTL_MS`) that preserves original publication timestamps.
  - Endpoints: `GET /api/news` (filterable by `q`, `category`, `country`, `ticker`, `sentiment`, `refresh`), `GET /api/news/health`, `GET /api/ai/health`, and `GET /api/providers/health`.
- **Light & Dark Theme** plus reduced-motion accessibility and hardened multi-currency formatting utilities (`USD`, `INR`, `EUR`, `GBP`, `GBp`, `JPY`, `HKD`, `CAD`, `AUD`, `KRW`, `SGD`, `CNY`).

---

## Architecture

| Layer | Technology | Entry Point |
| --- | --- | --- |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, Recharts, Motion | `src/main.tsx` |
| Backend API | Node.js, Express, TypeScript, Drizzle ORM, PostgreSQL | `server.ts` + `src/server/` |
| Dual AI Engine | Google Gemini (`@google/genai`) + OpenAI Chat Completions API | `src/server/services/ai/providerClient.ts` |
| Python ML Microservice | Python 3.10+, FastAPI, Pandas, NumPy, Scikit-learn | `ai-service/app/main.py` |
| Database | PostgreSQL (Cloud SQL / standard `DATABASE_URL`) | `src/db/schema.ts` |

---

## Local Development

### 1. Prerequisites
- Node.js 20+
- PostgreSQL database (`DATABASE_URL`)
- Optional: Python 3.10+ for the standalone FastAPI ML microservice (`ai-service/`)
- Optional: `GEMINI_API_KEY` and/or `OPENAI_API_KEY` for Dual AI synthesis (quantitative indicators, technicals, fundamentals, ML models, and Reverse Research anomaly detection remain fully operational even when AI providers are unavailable)

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your credentials (never commit `.env`):
```bash
cp .env.example .env
```

Key Dual AI environment variables:
```env
AI_PRIMARY_PROVIDER=gemini
AI_FALLBACK_PROVIDER=openai
GEMINI_API_KEY=
GEMINI_MODEL=gemini-4-hydrogen
GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
AI_REQUEST_TIMEOUT_MS=30000
```

### 3. Install Dependencies & Push Schema
```bash
npm install
npx drizzle-kit push --config=src/db/drizzle.config.ts
```

### 4. Run Full-Stack Server (Frontend + Backend on one port)
```bash
npm run dev
```
Default port is `3000` (configurable via `PORT`). In proxied dev environments without WebSocket upgrade support, set `DISABLE_HMR=true` so `server.ts` strips `/@vite/client` and prevents HMR WebSocket console errors.

### 5. Optional: Run Python FastAPI ML Service
```bash
cd ai-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```
Set `ANALYSIS_SERVICE_URL=http://127.0.0.1:8001` in `.env` to delegate ML inference to the Python service; otherwise the built-in Node quantitative ML engine runs automatically.

---

## Production Build & Deployment

Production builds never load Vite's dev client (`/@vite/client`) or depend on HMR WebSockets. `npm run build` emits content-hashed static assets to `dist/`, which `server.ts` serves with immutable caching and SPA fallback when `NODE_ENV=production`.

### Build & Run Locally
```bash
npm run lint
npm run build
NODE_ENV=production PORT=5000 npm start
```

### Render + Vercel
- **Render**: Blueprint included in `render.yaml` (`marketminds-node-backend` + `marketminds-python-ai`). Configure `GEMINI_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL`, and `JWT_SECRET` in Render Environment Variables.
- **Vercel**: Static frontend build (`npm run build`, output directory `dist/`) with SPA rewrite config in `vercel.json` (set `VITE_API_BASE_URL` to your deployed Render backend `/api` URL).

---

## Disclaimer
MarketMinds is built for educational and quantitative research purposes only. All AI briefs, reverse-research hypotheses, and ML projections are probabilistic model estimates and do not constitute personalized financial or investment advice.
