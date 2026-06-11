FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# libgomp1: runtime de OpenMP requerido por XGBoost.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN python3.11 -m pip install --upgrade pip \
    && python3.11 -m pip install -r requirements.txt

COPY . .

EXPOSE 8000

# --reload-exclude evita que el watcher reinicie el servidor cuando un pipeline
# escribe artefactos en app/models (best_model.joblib, *.json), lo que cortaba
# las peticiones de entrenamiento/scoring en curso.
CMD ["python3.11", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", \
     "--reload", "--reload-exclude", "*.joblib", "--reload-exclude", "*.json"]
