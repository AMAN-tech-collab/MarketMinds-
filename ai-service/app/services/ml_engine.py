from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List
import math
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler


def _compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False).mean()
    rs = gain / loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def run_sklearn_pipeline(
    symbol: str,
    exchange: str,
    bars: List[Dict[str, Any]],
    horizon_days: int = 7,
    currency: str = "USD",
) -> Dict[str, Any]:
    df = pd.DataFrame(bars)
    df = df.dropna(subset=["close", "volume"]).copy()
    df = df[df["close"] > 0].reset_index(drop=True)

    df["ret_1d"] = df["close"].pct_change(1)
    df["ret_3d"] = df["close"].pct_change(3)
    df["ret_5d"] = df["close"].pct_change(5)
    df["momentum_10d"] = df["close"].pct_change(10)
    df["sma5"] = df["close"].rolling(5).mean()
    df["sma20"] = df["close"].rolling(20).mean()
    df["ema12"] = df["close"].ewm(span=12, adjust=False).mean()
    df["ema26"] = df["close"].ewm(span=26, adjust=False).mean()
    df["rsi14"] = _compute_rsi(df["close"], 14)
    bb_std = df["close"].rolling(20).std()
    bb_upper = df["sma20"] + 2 * bb_std
    bb_lower = df["sma20"] - 2 * bb_std
    vol_sma20 = df["volume"].rolling(20).mean()

    typical_price = (df["high"] + df["low"] + df["close"]) / 3.0
    safe_vol = df["volume"].clip(lower=1.0)
    vwap20 = (typical_price * safe_vol).rolling(20).sum() / safe_vol.rolling(20).sum()

    df["sma5_ratio"] = (df["close"] - df["sma5"]) / df["sma5"]
    df["sma20_ratio"] = (df["close"] - df["sma20"]) / df["sma20"]
    df["ema_spread"] = (df["ema12"] - df["ema26"]) / df["close"]
    df["rsi14_norm"] = (df["rsi14"] - 50.0) / 50.0
    df["bb_pos"] = (df["close"] - bb_lower) / (bb_upper - bb_lower).replace(0, np.nan) - 0.5
    df["vwap_dev"] = (df["close"] - vwap20) / vwap20.replace(0, np.nan)
    df["vol_ratio"] = (df["volume"] / vol_sma20.replace(0, np.nan)).clip(upper=3.0) - 1.0
    df["rolling_vol_10d"] = df["ret_1d"].rolling(10).std()
    df["target_return"] = df["close"].shift(-1) / df["close"] - 1.0
    df["target_close"] = df["close"].shift(-1)
    df["target_date"] = df["date"].shift(-1)

    feature_cols = [
        "ret_1d",
        "ret_3d",
        "ret_5d",
        "momentum_10d",
        "sma5_ratio",
        "sma20_ratio",
        "ema_spread",
        "rsi14_norm",
        "bb_pos",
        "vwap_dev",
        "vol_ratio",
        "rolling_vol_10d",
    ]

    latest_row = df.iloc[-1][feature_cols].fillna(0.0).values.reshape(1, -1)
    current_price = float(df.iloc[-1]["close"])

    clean = df.dropna(subset=feature_cols + ["target_return", "target_close"]).reset_index(drop=True)
    if len(clean) < 40:
        raise ValueError(f"Insufficient clean rows ({len(clean)}) for chronological split.")

    split_idx = int(len(clean) * 0.8)
    train_df = clean.iloc[:split_idx]
    test_df = clean.iloc[split_idx:]

    scaler = StandardScaler()
    X_train = scaler.fit_transform(train_df[feature_cols].values)
    y_train = train_df["target_return"].values
    X_test = scaler.transform(test_df[feature_cols].values)
    X_latest = scaler.transform(latest_row)

    candidates = [
        ("Linear Regression (Ridge L2)", "v2.0-global-sklearn-ridge", Ridge(alpha=1.5)),
        (
            "Random Forest Regressor",
            "v2.0-global-sklearn-rf",
            RandomForestRegressor(n_estimators=120, max_depth=5, random_state=42),
        ),
        (
            "Gradient Boosting Regressor",
            "v2.0-global-sklearn-gbr",
            GradientBoostingRegressor(n_estimators=100, max_depth=3, learning_rate=0.06, random_state=42),
        ),
    ]

    models_out = []
    for name, version, est in candidates:
        est.fit(X_train, y_train)
        pred_ret = np.clip(est.predict(X_test), -0.08, 0.08)
        base_closes = test_df["close"].values
        actual_closes = test_df["target_close"].values
        pred_closes = base_closes * (1.0 + pred_ret)

        mae = float(mean_absolute_error(actual_closes, pred_closes))
        rmse = float(math.sqrt(mean_squared_error(actual_closes, pred_closes)))
        mape = float(np.mean(np.abs((actual_closes - pred_closes) / np.maximum(actual_closes, 1.0))) * 100.0)
        r2 = float(r2_score(actual_closes, pred_closes))
        dir_acc = float(np.mean((pred_ret >= 0) == (test_df["target_return"].values >= 0)) * 100.0)

        equity = 1.0
        trades = 0
        wins = 0
        for p_r, a_r in zip(pred_ret, test_df["target_return"].values):
            if p_r > 0.0015:
                trades += 1
                equity *= 1.0 + float(a_r)
                if a_r > 0:
                    wins += 1

        bnh = float(((actual_closes[-1] - base_closes[0]) / base_closes[0]) * 100.0)
        next_ret = float(np.clip(est.predict(X_latest)[0], -0.08, 0.08))
        horizon_ret = float(np.clip(next_ret * math.sqrt(horizon_days) * 0.65, -0.18, 0.18))

        models_out.append(
            {
                "modelName": name,
                "modelVersion": version,
                "mae": round(mae, 2),
                "rmse": round(rmse, 2),
                "mape": round(mape, 2),
                "r2": round(r2, 3),
                "directionalAccuracy": round(dir_acc, 1),
                "predictedNextClose": round(current_price * (1.0 + next_ret), 2),
                "predictedHorizonPrice": round(current_price * (1.0 + horizon_ret), 2),
                "expectedReturnPct": round(horizon_ret * 100.0, 2),
                "testPoints": [
                    {
                        "date": str(d),
                        "actual": round(float(a), 2),
                        "predicted": round(float(p), 2),
                    }
                    for d, a, p in zip(test_df["target_date"].values, actual_closes, pred_closes)
                ],
                "backtest": {
                    "strategyReturnPct": round((equity - 1.0) * 100.0, 2),
                    "buyAndHoldReturnPct": round(bnh, 2),
                    "winRatePct": round((wins / trades) * 100.0, 1) if trades else 0.0,
                    "tradesCount": trades,
                },
            }
        )

    winner = sorted(models_out, key=lambda m: m["rmse"])[0]
    daily_std = winner["rmse"]
    trajectory = []
    for day in range(1, horizon_days + 1):
        progress = day / horizon_days
        proj = current_price + (winner["predictedHorizonPrice"] - current_price) * math.sqrt(progress)
        spread = daily_std * math.sqrt(day) * 0.9
        trajectory.append(
            {
                "day": day,
                "label": f"T+{day}D",
                "predictedPrice": round(proj, 2),
                "lowerBand": round(max(0.01, proj - spread), 2),
                "upperBand": round(proj + spread, 2),
            }
        )

    return {
        "symbol": symbol,
        "exchange": exchange.upper(),
        "currency": currency.upper(),
        "engineSource": "python-fastapi",
        "horizonDays": horizon_days,
        "currentPrice": round(current_price, 2),
        "trainSamples": int(len(train_df)),
        "testSamples": int(len(test_df)),
        "featuresUsed": feature_cols,
        "bestModel": winner["modelName"],
        "models": models_out,
        "forecastTrajectory": trajectory,
        "methodologyNote": "Global scikit-learn models trained chronologically on 80% of cleaned OHLCV bars (including rolling VWAP and 10D momentum) and evaluated out-of-sample on the latest 20%.",
        "limitations": [
            "Historical price and volume features cannot anticipate earnings surprises, FX shocks, or central bank policy shifts.",
            "Backtest figures exclude brokerage, exchange fees/taxes, FX spreads, and execution slippage.",
            "Educational research output only — not guaranteed financial advice.",
        ],
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
