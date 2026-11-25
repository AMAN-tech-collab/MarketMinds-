from __future__ import annotations

from typing import List
from pydantic import BaseModel, Field


class OhlcvBar(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class PredictRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=28)
    exchange: str = Field("NASDAQ", min_length=2, max_length=16)
    currency: str = Field("USD", min_length=2, max_length=8)
    horizon_days: int = Field(7, ge=1, le=30)
    bars: List[OhlcvBar]


class AnalyzeRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=28)
    exchange: str = Field("NASDAQ", min_length=2, max_length=16)
    currency: str = Field("USD", min_length=2, max_length=8)
    bars: List[OhlcvBar]


class BacktestRequest(BaseModel):
    symbol: str = Field(..., min_length=1, max_length=28)
    exchange: str = Field("NASDAQ", min_length=2, max_length=16)
    currency: str = Field("USD", min_length=2, max_length=8)
    bars: List[OhlcvBar]
