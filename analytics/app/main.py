from fastapi import FastAPI

app = FastAPI(
    title="DataRaíz Analytics",
    description="Motor analítico de DataRaíz: modelos de valor, scoring y SHAP.",
    version="0.1.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
