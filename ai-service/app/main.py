from __future__ import annotations

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes.analysis import router as analysis_router

app = FastAPI(
    title="MarketMinds — Python Quantitative ML Service",
    version="2.0.0",
    description="Scikit-learn, Pandas, and NumPy forecasting & quantitative analysis microservice for global equities.",
)

allowed_origins = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "marketminds-python-ai-service",
        "models": [
            "Linear Regression (Ridge L2)",
            "Random Forest Regressor",
            "Gradient Boosting Regressor",
        ],
        "version": "2.0.0",
    }


app.include_router(analysis_router)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8001"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=False)
