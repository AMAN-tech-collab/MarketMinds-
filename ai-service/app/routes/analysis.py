from __future__ import annotations

from fastapi import APIRouter, HTTPException
from app.models.schemas import AnalyzeRequest, BacktestRequest, PredictRequest
from app.services.ml_engine import run_sklearn_pipeline

router = APIRouter()


@router.post("/predict")
def predict_stock(payload: PredictRequest):
    if len(payload.bars) < 60:
        raise HTTPException(
            status_code=422,
            detail=f"At least 60 OHLCV sessions are required; received {len(payload.bars)}.",
        )
    try:
        return run_sklearn_pipeline(
            symbol=payload.symbol.upper(),
            exchange=payload.exchange.upper(),
            currency=payload.currency.upper(),
            bars=[b.model_dump() for b in payload.bars],
            horizon_days=payload.horizon_days,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ML inference error: {exc}")


@router.post("/analyze")
def analyze_stock(payload: AnalyzeRequest):
    if len(payload.bars) < 60:
        raise HTTPException(
            status_code=422,
            detail=f"At least 60 OHLCV sessions are required for analysis; received {len(payload.bars)}.",
        )
    try:
        ml_result = run_sklearn_pipeline(
            symbol=payload.symbol.upper(),
            exchange=payload.exchange.upper(),
            currency=payload.currency.upper(),
            bars=[b.model_dump() for b in payload.bars],
            horizon_days=7,
        )
        winner = next(
            (m for m in ml_result["models"] if m["modelName"] == ml_result["bestModel"]),
            ml_result["models"][0],
        )
        ret = winner["expectedReturnPct"]
        decision = "BUY" if ret >= 2.0 else "SELL" if ret <= -2.0 else "HOLD"
        confidence = min(78, max(42, round(winner["directionalAccuracy"])))
        return {
            "symbol": ml_result["symbol"],
            "exchange": ml_result["exchange"],
            "currency": ml_result["currency"],
            "decision": decision,
            "confidenceScore": confidence,
            "bestModel": ml_result["bestModel"],
            "mlPipeline": ml_result,
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Analysis service error: {exc}")


@router.post("/backtest")
def backtest_stock(payload: BacktestRequest):
    if len(payload.bars) < 60:
        raise HTTPException(
            status_code=422,
            detail=f"At least 60 OHLCV sessions are required for walk-forward backtesting; received {len(payload.bars)}.",
        )
    try:
        ml_result = run_sklearn_pipeline(
            symbol=payload.symbol.upper(),
            exchange=payload.exchange.upper(),
            currency=payload.currency.upper(),
            bars=[b.model_dump() for b in payload.bars],
            horizon_days=7,
        )
        return {
            "symbol": ml_result["symbol"],
            "exchange": ml_result["exchange"],
            "currency": ml_result["currency"],
            "trainSamples": ml_result["trainSamples"],
            "testSamples": ml_result["testSamples"],
            "bestModel": ml_result["bestModel"],
            "evaluations": [
                {
                    "modelName": m["modelName"],
                    "modelVersion": m["modelVersion"],
                    "mae": m["mae"],
                    "rmse": m["rmse"],
                    "mape": m["mape"],
                    "r2": m["r2"],
                    "directionalAccuracy": m["directionalAccuracy"],
                    "backtest": m["backtest"],
                }
                for m in ml_result["models"]
            ],
            "methodologyNote": ml_result["methodologyNote"],
            "limitations": ml_result["limitations"],
            "generatedAt": ml_result["generatedAt"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Backtest error: {exc}")
