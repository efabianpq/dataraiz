# DataRaíz — Plan de Desarrollo Controlado
## Guía completa para construcción con Claude Code

> **Versión:** 1.0 | **Proyecto:** DataRaíz MVP — Área Metropolitana Bucaramanga  
> **Stack:** Next.js 16 · NestJS 11 · FastAPI · PostgreSQL/PostGIS · Docker

---

## ÍNDICE

1. [Prerrequisitos de software](#1-prerrequisitos-de-software)
2. [Estructura del repositorio](#2-estructura-del-repositorio)
3. [Contexto para Claude Code (CLAUDE.md)](#3-contexto-para-claude-code-claudemd)
4. [División por fases — Sesiones de Claude Code](#4-división-por-fases)
5. [Protocolo de feedback entre fases](#5-protocolo-de-feedback-entre-fases)
6. [Estrategia de testing por capa](#6-estrategia-de-testing-por-capa)
7. [Guía de actualización del CLAUDE.md](#7-guía-de-actualización-del-claudemd)
8. [Checklist de cierre de sesión](#8-checklist-de-cierre-de-sesión)
9. [Riesgos y mitigaciones](#9-riesgos-y-mitigaciones)

---

## 1. PRERREQUISITOS DE SOFTWARE

### 1.1 Sistema operativo recomendado

**Ubuntu Server 22.04 LTS** (o Ubuntu Desktop 22.04). El plan asume Linux; en Windows se puede usar WSL2 con Ubuntu, pero el comportamiento de Docker es ligeramente diferente.

```
Requisitos mínimos del servidor/máquina:
  RAM:       16 GB (8 GB mínimo absoluto; los modelos ML consumen memoria)
  CPU:       4 núcleos (8 recomendado para scraping + FastAPI simultáneos)
  Disco:     50 GB libres (imágenes Docker + datos PostGIS + modelos)
  Red:       Acceso a internet para scraping y descarga de dependencias
```

---

### 1.2 Software base del servidor

Instalar en orden. Cada bloque es un script que se puede correr directamente.

#### A. Herramientas de sistema esenciales

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  curl wget git unzip build-essential \
  software-properties-common ca-certificates \
  gnupg lsb-release htop net-tools
```

#### B. Docker Engine + Docker Compose V2

```bash
# Agregar repositorio oficial de Docker
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

echo "deb [arch=$(dpkg --print-architecture) \
  signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Permitir usar Docker sin sudo
sudo usermod -aG docker $USER
newgrp docker

# Verificar
docker --version          # Docker version 26.x o superior
docker compose version    # Docker Compose version v2.x
```

#### C. Node.js 20 LTS (para desarrollo local, no solo en contenedor)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version    # v20.x
npm --version     # 10.x
```

#### D. Python 3.11 + pip + venv

```bash
sudo apt install -y python3.11 python3.11-venv python3-pip
python3.11 --version   # Python 3.11.x
pip3 --version
```

#### E. Git y configuración inicial

```bash
git --version   # ya instalado en paso A

git config --global user.name  "Tu Nombre"
git config --global user.email "tu@email.com"
git config --global init.defaultBranch main
```

#### F. Claude Code CLI

```bash
npm install -g @anthropic-ai/claude-code
claude --version
# Autenticar con tu cuenta Anthropic
claude
```

#### G. Playwright (para scraping, instalación global + browsers)

```bash
npm install -g playwright
npx playwright install chromium
npx playwright install-deps chromium
```

#### H. Cloudflare Tunnel (para acceso remoto bajo demanda)

```bash
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb \
  -o cloudflared.deb
sudo dpkg -i cloudflared.deb
cloudflared --version
```

---

### 1.3 Software de desarrollo local (IDE y utilidades)

```bash
# VSCode (opcional pero recomendado para revisar código entre sesiones)
wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg
sudo install -D -o root -g root -m 644 packages.microsoft.gpg \
  /etc/apt/keyrings/packages.microsoft.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/packages.microsoft.gpg] \
  https://packages.microsoft.com/repos/code stable main" \
  | sudo tee /etc/apt/sources.list.d/vscode.list
sudo apt update && sudo apt install -y code

# Extensions recomendadas (instalar desde VSCode):
# - Docker (ms-azuretools.vscode-docker)
# - PostgreSQL (cweijan.vscode-postgresql-client2)
# - ESLint + Prettier
# - Python (ms-python.python)
# - REST Client (humao.rest-client)
```

---

### 1.4 Verificación final del entorno

```bash
# Ejecutar este script antes de comenzar cualquier fase
echo "=== Verificación DataRaíz ==="
docker --version && echo "✅ Docker OK" || echo "❌ Docker FALTA"
docker compose version && echo "✅ Compose OK" || echo "❌ Compose FALTA"
node --version && echo "✅ Node OK" || echo "❌ Node FALTA"
python3.11 --version && echo "✅ Python OK" || echo "❌ Python FALTA"
git --version && echo "✅ Git OK" || echo "❌ Git FALTA"
claude --version && echo "✅ Claude Code OK" || echo "❌ Claude Code FALTA"
npx playwright --version && echo "✅ Playwright OK" || echo "❌ Playwright FALTA"
cloudflared --version && echo "✅ Cloudflared OK" || echo "❌ Cloudflared FALTA"
```

---

## 2. ESTRUCTURA DEL REPOSITORIO

Crear esta estructura antes de comenzar la Fase 0:

```
dataraiz/
├── CLAUDE.md                   ← Contexto maestro para Claude Code (ver sección 3)
├── docker-compose.yml          ← Orquestación completa
├── docker-compose.override.yml ← Overrides de desarrollo (hot-reload)
├── .env.example                ← Variables de entorno plantilla
├── .env                        ← Variables reales (en .gitignore)
├── .gitignore
├── README.md
│
├── frontend/                   ← Next.js 16 + Tailwind + shadcn/ui
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── app/               ← App Router de Next.js
│       ├── components/        ← Componentes UI
│       └── lib/               ← Utilidades y clientes API
│
├── backend/                    ← NestJS 11 (TypeScript)
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── inmuebles/         ← Módulo principal
│       ├── watchlist/         ← Módulo de alertas
│       ├── reportes/          ← Generación de PDFs
│       └── analytics/         ← Proxy hacia motor Python
│
├── analytics/                  ← FastAPI + scikit-learn + XGBoost
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py
│       ├── models/            ← Modelos ML serializado (.joblib)
│       ├── pipelines/         ← Pipeline analítico por etapa
│       └── schemas/           ← Pydantic schemas
│
├── scrapers/                   ← Playwright scrapers
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── fincaraiz.ts
│       ├── metrocuadrado.ts
│       └── ciencuadras.ts
│
├── database/
│   ├── migrations/            ← Scripts SQL ordenados por número
│   │   ├── 001_schema_inicial.sql
│   │   ├── 002_postgis_extension.sql
│   │   └── 003_datos_semilla.sql
│   └── seeds/                 ← Datos de prueba para desarrollo
│
├── datos_oficiales/            ← Scripts para cargar POT/catastro/riesgo
│   ├── pot_bucaramanga/
│   ├── catastro/
│   └── riesgo/
│
└── docs/
    ├── fases/                 ← Documentos de cada fase completada
    │   └── fase_00_completada.md
    ├── decisiones/            ← ADRs (Architecture Decision Records)
    └── api/                   ← Specs OpenAPI exportadas
```

---

## 3. CONTEXTO PARA CLAUDE CODE (CLAUDE.md)

Este es el archivo más importante. Claude Code lo lee al inicio de cada sesión. Ubicarlo en la raíz del repositorio. **Actualizarlo al finalizar cada fase** (ver sección 7).

```markdown
# CLAUDE.md — DataRaíz: Contexto del Proyecto

> Última actualización: [FECHA]  
> Fase actual: [FASE X — NOMBRE]  
> Estado: [EN PROGRESO / COMPLETADA]

---

## QUÉ ES ESTE PROYECTO

DataRaíz es una plataforma de apoyo a decisiones de inversión inmobiliaria para el
mercado colombiano. Integra datos de portales inmobiliarios, catastro, POT y riesgo
territorial para generar un score de inversión explicable por inmueble.

**Zona piloto:** Área Metropolitana de Bucaramanga (Bucaramanga, Floridablanca,
Girón, Piedecuesta).

---

## ARQUITECTURA

Todos los servicios corren como contenedores Docker orquestados por Docker Compose:

| Servicio       | Tecnología              | Puerto | Descripción                         |
|---------------|-------------------------|--------|-------------------------------------|
| frontend       | Next.js 16 + Tailwind   | 3000   | Dashboard interactivo + mapa        |
| backend        | NestJS 11 (TypeScript)  | 3001   | API REST, lógica de negocio         |
| analytics      | FastAPI (Python 3.11)   | 8000   | Motor ML: modelos, scoring, SHAP    |
| scrapers       | Playwright (Node.js)    | —      | Worker de scraping programado       |
| db             | PostgreSQL 16 + PostGIS | 5432   | Base de datos geoespacial           |
| redis          | Redis 7                 | 6379   | Cola BullMQ + caché                 |

---

## ESTADO DE FASES

| Fase | Nombre                        | Estado    | Fecha fin |
|------|-------------------------------|-----------|-----------|
| 0    | Entorno y esqueletos           | ⬜ Pendiente | —       |
| 1    | Ingesta de datos               | ⬜ Pendiente | —       |
| 2    | Geoprocesamiento               | ⬜ Pendiente | —       |
| 3    | Modelos de valor               | ⬜ Pendiente | —       |
| 4    | Segmentación y comps           | ⬜ Pendiente | —       |
| 5    | Oportunidad y finanzas         | ⬜ Pendiente | —       |
| 6    | Score y optimización           | ⬜ Pendiente | —       |
| 7    | Aplicación (UI + API)          | ⬜ Pendiente | —       |
| 8    | Validación y cierre            | ⬜ Pendiente | —       |

---

## DECISIONES TÉCNICAS CLAVE

1. **Sin IA generativa de pago en el MVP.** Todo procesamiento es con modelos locales
   de código abierto (scikit-learn, XGBoost, pymoo, SHAP). Claude API es una mejora
   futura opcional.

2. **n8n reemplazado por @nestjs/schedule + BullMQ.** La orquestación vive en código
   TypeScript, versionable y testeable.

3. **MapLibre GL JS en lugar de Mapbox GL JS.** Fork open-source, sin costo por carga.

4. **Frontend y backend en TypeScript.** Motor analítico en Python. Comunicación via
   HTTP entre NestJS y FastAPI.

5. **PostgreSQL + PostGIS es el núcleo.** Todos los resultados precalculados viven en
   la DB; el backend solo lee, no recalcula en cada petición.

---

## CONVENCIONES DE CÓDIGO

### TypeScript (frontend + backend)
- ESLint + Prettier configurados (ver .eslintrc.js)
- Imports con alias: `@/` para src/
- Funciones async/await, no callbacks
- Interfaces sobre types cuando sea posible
- Nombres en inglés para código, español para comentarios y logs

### Python (analytics)
- Black + isort para formato
- Type hints en todas las funciones públicas
- Pydantic para validación de entrada/salida en FastAPI
- Modelos entrenados se serializan con joblib en analytics/app/models/
- Logging con structlog

### SQL / PostGIS
- Migraciones numeradas: 001_, 002_, etc.
- Nombres de tablas en español (inmueble, zona, analisis_inmueble, etc.)
- Geometrías siempre en SRID 4326 (WGS84) para transferencia; 
  usar ST_Transform a 9377 (MAGNA-SIRGAS) para cálculos de distancia en metros

---

## VARIABLES DE ENTORNO REQUERIDAS

Ver `.env.example` en la raíz. Las variables activas están en `.env` (no en git).

Variables críticas:
- `DATABASE_URL` — conexión PostgreSQL
- `REDIS_URL` — conexión Redis
- `ANALYTICS_URL` — URL interna del servicio FastAPI
- `SCRAPING_INTERVAL_HOURS` — frecuencia de scraping (default: 6)
- `PILOT_CITIES` — ciudades habilitadas (default: "bucaramanga,floridablanca,giron,piedecuesta")

---

## COMANDOS FRECUENTES

```bash
# Levantar todo
docker compose up -d

# Ver logs en tiempo real
docker compose logs -f [servicio]

# Reiniciar un servicio específico
docker compose restart analytics

# Conectarse a la DB
docker compose exec db psql -U dataraiz -d dataraiz_db

# Correr migraciones manualmente
docker compose exec db psql -U dataraiz -d dataraiz_db \
  -f /docker-entrypoint-initdb.d/001_schema_inicial.sql

# Correr tests del backend
docker compose exec backend npm run test

# Correr tests del motor analítico  
docker compose exec analytics pytest -v

# Tunnel para acceso externo (solo cuando se necesita)
cloudflared tunnel --url http://localhost:3000
```

---

## GUÍA DE CONTEXTO PARA SESIONES

Al iniciar una sesión en Claude Code, mencionar siempre:
1. La fase en la que se está trabajando
2. El último entregable completado
3. El objetivo específico de la sesión
4. Cualquier problema conocido o deuda técnica

Ejemplo de inicio de sesión:
> "Estamos en la Fase 2 (Geoprocesamiento). La Fase 1 quedó completada:
>  tenemos scraper de Fincaraíz funcionando y datos cargados en PostGIS.
>  En esta sesión queremos construir las consultas espaciales para calcular
>  distancias a proyectos POT. Problema conocido: las geometrías del POT 
>  están en MAGNA-SIRGAS, necesitamos transformarlas a WGS84."

---

## ARCHIVOS CRÍTICOS A NO MODIFICAR SIN REVISIÓN

- `docker-compose.yml` — cambios aquí afectan todos los servicios
- `database/migrations/` — nunca editar migraciones ya aplicadas; crear nuevas
- `analytics/app/models/` — modelos entrenados; no eliminar sin respaldo

---

## DEUDA TÉCNICA Y MEJORAS FUTURAS (fuera del MVP)

- [ ] Integración con datos de notariado/registro para transacciones cerradas
- [ ] Cobertura de otras ciudades (Bogotá, Medellín, Cali)
- [ ] Capa Claude API para reportes en lenguaje natural
- [ ] Multi-tenencia (aislamiento por organización)
- [ ] Autenticación robusta (Supabase Auth o Clerk)
- [ ] Migración a Google Cloud Run (fase SaaS)
```

---

## 4. DIVISIÓN POR FASES

Cada fase está diseñada para completarse en **1–3 sesiones de Claude Code**, con un entregable verificable al final. Nunca iniciar la siguiente fase si el entregable de la actual no funciona.

---

### FASE 0 — Entorno y Esqueletos
**Duración estimada:** 1 sesión (2–3 horas)  
**Objetivo:** Todo el stack levanta con `docker compose up`, aunque los servicios estén vacíos.

#### Prompt de inicio para Claude Code

```
Iniciamos la Fase 0 de DataRaíz. El objetivo es tener el entorno base
funcionando: Docker Compose con todos los servicios, esqueletos de código
para NestJS, Next.js y FastAPI, y la DB inicializada con PostGIS.

No necesitamos lógica de negocio todavía, solo que todo levante y se
comunique correctamente.

Entregables esperados:
1. docker-compose.yml con servicios: db (PostGIS), redis, backend (NestJS),
   analytics (FastAPI), frontend (Next.js), scrapers (Playwright worker)
2. Esqueleto NestJS con módulo de health check en GET /health
3. Esqueleto FastAPI con endpoint GET /health
4. Esqueleto Next.js con página principal que muestre "DataRaíz - En construcción"
5. Schema SQL inicial: tablas inmueble, zona, proyecto_pot, capa_riesgo,
   analisis_inmueble, comparable, usuario, watchlist, alerta
6. .env.example con todas las variables necesarias
7. README con instrucciones de arranque
```

#### Entregables de la Fase 0

- [ ] `docker compose up -d` levanta sin errores
- [ ] `curl http://localhost:3001/health` → `{"status":"ok"}`
- [ ] `curl http://localhost:8000/health` → `{"status":"ok"}`
- [ ] `http://localhost:3000` muestra la página inicial
- [ ] `docker compose exec db psql -U dataraiz -d dataraiz_db -c "\dt"` lista las tablas
- [ ] PostGIS habilitado: `SELECT PostGIS_Version();` retorna versión

#### Tests de la Fase 0

```bash
# Script de verificación rápida
echo "=== Test Fase 0 ==="
curl -sf http://localhost:3001/health | grep -q "ok" && echo "✅ Backend" || echo "❌ Backend"
curl -sf http://localhost:8000/health | grep -q "ok" && echo "✅ Analytics" || echo "❌ Analytics"
curl -sf http://localhost:3000 | grep -qE "DataRa.z" && echo "✅ Frontend" || echo "❌ Frontend"
docker compose exec db psql -U dataraiz -d dataraiz_db -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN \
  ('inmueble','zona','proyecto_pot','capa_riesgo','analisis_inmueble','comparable','usuario','watchlist','alerta');" \
  | grep -q "9" && echo "✅ DB tablas" || echo "❌ DB tablas"
docker compose exec db psql -U dataraiz -d dataraiz_db -c \
  "SELECT PostGIS_Version();" | grep -qi "postgis_version" && echo "✅ PostGIS" || echo "❌ PostGIS"
```

---

### FASE 1 — Ingesta de Datos
**Duración estimada:** 2–3 sesiones  
**Objetivo:** Datos reales de inmuebles y datos oficiales cargados en PostGIS.

#### Sub-fase 1A: Scraper Fincaraíz (1 sesión)

```
Fase 1A. Tenemos el entorno base funcionando (Fase 0 completada).
Necesitamos construir el scraper de Fincaraíz para el Área Metropolitana
de Bucaramanga usando Playwright.

El scraper debe:
- Extraer: precio, área m2, habitaciones, baños, tipo (apto/casa/lote/local),
  dirección, descripción, lat/lng si está disponible, URL del anuncio
- Guardar en tabla inmueble con georreferenciación (PostGIS geometry POINT)
- Si no hay lat/lng en el portal, geocodificar con Nominatim (OSM, gratis)
- Respetar robots.txt, límite de 1 req/seg, horarios de baja carga
- Manejo de errores: reintentos con backoff, log de fallos
- Deduplicación por URL del anuncio

Librería de colas: BullMQ con Redis (ya configurado en docker-compose).
El scraper se dispara como job programado desde NestJS.
```

#### Sub-fase 1B: Datos oficiales POT/Catastro/Riesgo (1–2 sesiones)

```
Fase 1B. El scraper de Fincaraíz está funcionando (1A completada).
Ahora necesitamos cargar los datos oficiales territoriales.

Fuentes de datos para Bucaramanga:
1. POT Bucaramanga — descargable desde la Alcaldía o IGAC en formatos
   Shapefile o GeoJSON. Cargar en tabla proyecto_pot.
2. Catastro — datos del IGAC (igac.gov.co). Cargar avalúos catastrales
   donde sea posible.
3. Riesgo — UNGRD (ungrd.gov.co) o CDMB para amenaza de inundación y
   remoción en masa. Cargar en tabla capa_riesgo.

Para cada capa:
- Script Python usando GeoPandas para transformar y cargar en PostGIS
- Transformar a SRID 4326 si los datos vienen en otro sistema
- Validar que las geometrías sean válidas (ST_IsValid)
- Crear índices espaciales (GIST) en cada tabla

Herramienta: ogr2ogr o GeoPandas según el formato de entrada.
```

#### Entregables de la Fase 1

- [ ] Scraper Fincaraíz carga ≥ 200 inmuebles en la tabla `inmueble`
- [ ] Al menos 80% de los inmuebles tienen coordenadas válidas en PostGIS
- [ ] Tabla `proyecto_pot` con datos del POT de Bucaramanga cargados
- [ ] Tabla `capa_riesgo` con capas de amenaza cargadas
- [ ] BullMQ job programado funciona (se puede disparar manualmente)
- [ ] `SELECT count(*) FROM inmueble WHERE geom IS NOT NULL;` > 160

#### Tests de la Fase 1

```bash
echo "=== Test Fase 1 ==="
docker compose exec db psql -U dataraiz -d dataraiz_db -c \
  "SELECT count(*) FROM inmueble;" 
docker compose exec db psql -U dataraiz -d dataraiz_db -c \
  "SELECT count(*) FROM inmueble WHERE geom IS NOT NULL;"
docker compose exec db psql -U dataraiz -d dataraiz_db -c \
  "SELECT count(*) FROM proyecto_pot;"
docker compose exec db psql -U dataraiz -d dataraiz_db -c \
  "SELECT count(*) FROM capa_riesgo;"
# Verificar que las geometrías son válidas
docker compose exec db psql -U dataraiz -d dataraiz_db -c \
  "SELECT count(*) FROM inmueble WHERE NOT ST_IsValid(geom);"
```

---

### FASE 2 — Geoprocesamiento
**Duración estimada:** 1–2 sesiones  
**Objetivo:** Variables de contexto territorial calculadas para cada inmueble.

#### Prompt de inicio

```
Fase 2 (Geoprocesamiento). Tenemos datos de inmuebles y capas territoriales
en PostGIS. Ahora necesitamos construir las variables de contexto espacial.

Para cada inmueble en la tabla inmueble, calcular y guardar en una tabla
variables_espaciales (o columnas en analisis_inmueble):

Variables a calcular (PostGIS SQL):
1. dist_pot_m: distancia en metros al proyecto POT más cercano
   (usar ST_Transform a SRID 9377 para distancias precisas en Colombia)
2. en_zona_riesgo: boolean — intersecta con alguna capa_riesgo
3. nivel_riesgo: 'bajo'/'medio'/'alto'/null según categoria de capa_riesgo
4. dist_centrocentro_m: distancia al centro de Bucaramanga (coord fija)
5. zona_id: a qué zona/barrio pertenece el inmueble (spatial join)

El procesamiento debe:
- Correr como script Python en el servicio analytics (GeoPandas + SQLAlchemy)
- Ser re-ejecutable (idempotente): si ya existe el cálculo, actualizarlo
- Procesar en lotes de 100 inmuebles para no agotar memoria
- Loggear progreso y errores

También crear endpoint FastAPI POST /analytics/geoprocesar que
dispara el recálculo bajo demanda.
```

#### Entregables de la Fase 2

- [ ] Todas las variables espaciales calculadas para ≥ 90% de los inmuebles con geom
- [ ] `SELECT avg(dist_pot_m) FROM analisis_inmueble;` retorna valor razonable (< 5000m en área urbana)
- [ ] `SELECT count(*) FROM analisis_inmueble WHERE en_zona_riesgo = true;` > 0
- [ ] Índices espaciales creados en todas las geometrías
- [ ] Endpoint `/analytics/geoprocesar` funciona y completa sin errores

---

### FASE 3 — Modelos de Valor de Mercado
**Duración estimada:** 2 sesiones  
**Objetivo:** Estimación de valor de mercado con 4 modelos y selección del mejor.

#### Prompt de inicio

```
Fase 3 (Modelos de valor). Geoprocesamiento completado. Ahora construimos
el pipeline de estimación de valor de mercado en el servicio FastAPI/Python.

Pipeline completo:
1. Features: precio_m2, area_m2, habitaciones, banos, tipo (encoded),
   dist_pot_m, dist_centrocentro_m, nivel_riesgo (encoded), zona (encoded)
   
2. Entrenar 4 modelos sobre los datos actuales (train/test 80/20):
   - LinearRegression (modelo base interpretable)
   - DecisionTreeRegressor (max_depth=8)
   - RandomForestRegressor (n_estimators=100)
   - XGBRegressor
   
3. Para Random Forest y XGBoost, usar RandomizedSearchCV (n_iter=20, cv=5)
   para optimizar hiperparámetros
   
4. Evaluar con RMSE, MAE y R² en test set; seleccionar el mejor modelo
   por RMSE
   
5. Serializar el mejor modelo con joblib en analytics/app/models/
   
6. Para cada inmueble, calcular:
   - valor_estimado: predicción del mejor modelo
   - brecha: (precio_publicado - valor_estimado) / valor_estimado * 100
     (positivo = sobrevalorado, negativo = subvalorado)
     
7. Guardar resultados en analisis_inmueble (columnas valor_estimado, brecha)

8. Endpoint FastAPI POST /analytics/entrenar que re-entrena los modelos
9. Endpoint FastAPI GET /analytics/metricas que retorna métricas del modelo activo
```

#### Entregables de la Fase 3

- [ ] Los 4 modelos se entrenan sin errores
- [ ] `GET /analytics/metricas` retorna RMSE, MAE, R² del modelo seleccionado
- [ ] R² > 0.60 (razonable con datos limitados del piloto)
- [ ] `SELECT count(*) FROM analisis_inmueble WHERE valor_estimado IS NOT NULL;` = total inmuebles con features completos
- [ ] Modelo serializado existe en `analytics/app/models/best_model.joblib`

---

### FASE 4 — Segmentación y Comparables
**Duración estimada:** 1–2 sesiones  
**Objetivo:** Mercado segmentado, comparables identificados por inmueble.

#### Prompt de inicio

```
Fase 4 (Segmentación y comparables). Los modelos de valor están funcionando.

Parte A — Segmentación:
1. Aplicar PCA (n_components=5) sobre las features normalizadas para
   descorrelacionar variables
2. Aplicar K-means (probar k=4,5,6 y elegir por coeficiente de silueta)
3. Asignar segmento a cada inmueble en analisis_inmueble (columna segmento)
4. Guardar PCA y K-means serializados en analytics/app/models/

Parte B — Comparables:
1. Para cada inmueble, encontrar los 5 más similares dentro del mismo
   segmento y misma zona (o zona adyacente)
2. Similaridad: distancia euclidiana en el espacio PCA
3. Criterio adicional: fecha de captura reciente (últimos 60 días preferidos)
4. Guardar en tabla comparable: (inmueble_id, comparable_id, distancia_pca,
   dif_precio_m2, posicion_vs_mediana)
5. posicion_vs_mediana: si el inmueble está por encima/abajo de la mediana
   de precio/m2 de sus comparables (columna en analisis_inmueble)

Endpoint: POST /analytics/segmentar — re-calcula segmentos y comparables
```

#### Entregables de la Fase 4

- [ ] Coeficiente de silueta del K-means seleccionado > 0.30
- [ ] `SELECT DISTINCT segmento FROM analisis_inmueble;` retorna los k clusters
- [ ] `SELECT count(*) FROM comparable;` ≥ inmuebles × 3 comparables promedio
- [ ] `SELECT * FROM comparable LIMIT 5;` muestra datos coherentes

---

### FASE 5 — Oportunidad y Capa Financiera
**Duración estimada:** 1–2 sesiones  
**Objetivo:** Probabilidad de oportunidad + rentabilidad estimada (yield, cap rate).

#### Prompt de inicio

```
Fase 5 (Oportunidad y finanzas). Segmentación y comparables completados.

Parte A — Clasificador de oportunidad:
Definir regla de negocio para etiquetar "oportunidad = 1":
  - brecha < -10% (subvalorado ≥ 10% vs valor estimado)
  - Y posicion_vs_mediana = 'debajo'
  - Y nivel_riesgo != 'alto'
  
Entrenar LogisticRegression sobre estas etiquetas con features:
  brecha, posicion_vs_mediana (encoded), dist_pot_m, nivel_riesgo (encoded),
  segmento, dist_centrocentro_m

Guardar prob_oportunidad (float 0-1) en analisis_inmueble.

Parte B — Capa financiera:
Para cada inmueble estimar canon de arriendo:
  Método: ratio canon/precio por segmento y zona (calculado de los propios datos
  o usar ratio de mercado colombiano ≈ 0.4–0.6% mensual del precio de venta)

Calcular:
  - canon_estimado_mensual = precio * ratio_zona_segmento
  - yield_bruto = (canon_estimado_mensual * 12) / precio * 100  (% anual)
  - cap_rate = (canon_estimado_mensual * 12 * 0.85) / precio * 100
    (asumiendo 15% gastos operativos — vacancia, administración, mantenimiento)

Guardar en analisis_inmueble: canon_estimado_mensual, yield_bruto, cap_rate

Endpoints:
  POST /analytics/clasificar — re-calcula probabilidades de oportunidad
  POST /analytics/financiero — re-calcula indicadores financieros
```

#### Entregables de la Fase 5

- [ ] `SELECT count(*) FROM analisis_inmueble WHERE prob_oportunidad > 0.7;` > 0 (hay oportunidades identificadas)
- [ ] `SELECT avg(yield_bruto) FROM analisis_inmueble WHERE yield_bruto IS NOT NULL;` entre 4% y 10% (rango razonable Colombia)
- [ ] AUC del clasificador logístico > 0.65 (puede ser bajo con datos sintéticos del piloto)

---

### FASE 6 — Score Integrado, SHAP y NSGA-II
**Duración estimada:** 2 sesiones  
**Objetivo:** Score 0–100 explicable por inmueble + optimización multicriterio.

#### Prompt de inicio

```
Fase 6 (Score y optimización). Pipeline analítico completo hasta Fase 5.

Parte A — Scoring integrado:
Calcular score (0–100) como combinación ponderada normalizada:

  score = 100 * normalize(
    w1 * prob_oportunidad           (peso: 0.30)
  + w2 * (-brecha_norm)             (peso: 0.25, negativo = más subvalorado = mejor)
  + w3 * yield_bruto_norm           (peso: 0.25)
  + w4 * (1 - riesgo_norm)          (peso: 0.10, menos riesgo = mejor)
  + w5 * posicion_comp_norm         (peso: 0.10, debajo mediana = mejor)
  )

Los pesos son configurables via variable de entorno SCORE_WEIGHTS.
normalize() = min-max por columna dentro del dataset actual.

Parte B — Explicabilidad con SHAP:
Para cada inmueble, calcular valores SHAP del modelo de estimación de valor
(el mejor modelo de Fase 3). Guardar como JSON en analisis_inmueble.shap_json.
Formato: {"feature": "dist_pot_m", "value": 150.2, "impact": 0.08} por feature.

Endpoint: GET /analytics/score/{inmueble_id}/explicacion

Parte C — Optimización multicriterio NSGA-II:
Endpoint: POST /analytics/optimizar
Body: { presupuesto_max, zona_ids, tipos, tolerancia_riesgo }

Usar pymoo NSGA-II para optimizar simultáneamente:
  - Maximizar yield_bruto
  - Minimizar precio
  - Minimizar riesgo_norm

Retornar: lista de inmuebles en el frente de Pareto (los mejores compromisos)
Tiempo máximo de cómputo: 10 segundos (limitar generaciones del algoritmo)
```

#### Entregables de la Fase 6

- [ ] `SELECT max(score), min(score), avg(score) FROM analisis_inmueble;` muestra distribución 0–100
- [ ] `GET /analytics/score/{id}/explicacion` retorna JSON con contribuciones SHAP
- [ ] `POST /analytics/optimizar` responde en < 10 segundos con ≥ 3 inmuebles en el frente de Pareto
- [ ] SHAP calculado para todos los inmuebles con datos completos

---

### FASE 7 — Aplicación: API, Dashboard y Alertas
**Duración estimada:** 3–4 sesiones  
**Objetivo:** Producto funcional con UI completa.

#### Sub-fase 7A: API NestJS completa (1–2 sesiones)

```
Fase 7A. Motor analítico completo (Fases 0–6). Construir la API REST
completa en NestJS que expone los datos al frontend.

Endpoints requeridos:
GET  /api/inmuebles              — lista paginada con filtros (precio, tipo, zona, score_min)
GET  /api/inmuebles/:id          — ficha completa con analisis, shap, comps
GET  /api/inmuebles/:id/reporte  — genera y retorna PDF del análisis
POST /api/watchlist              — guardar búsqueda/criterios
GET  /api/watchlist              — listar búsquedas guardadas del usuario
DELETE /api/watchlist/:id
GET  /api/alertas                — listar alertas no vistas del usuario
PUT  /api/alertas/:id/vista      — marcar alerta como vista
POST /api/optimizar              — proxy hacia analytics NSGA-II

El PDF se genera server-side con puppeteer o @react-pdf/renderer.
Autenticación: JWT básico (no multi-tenant en MVP, un solo usuario admin).

Documentación Swagger auto-generada en /api/docs.
```

#### Sub-fase 7B: Dashboard Next.js (2 sesiones)

```
Fase 7B. API NestJS completa. Construir el dashboard en Next.js.

Páginas y componentes:
1. / (página principal):
   - Barra de filtros lateral: precio min/max, tipo, zona, score mínimo,
     radio de distancia al POT, máximo nivel de riesgo
   - Mapa MapLibre GL JS con pines por propiedad (color según score)
   - Tabla inferior con las 20 propiedades de mayor score
   - Botón "Optimizar" que abre modal de NSGA-II

2. /inmueble/[id]:
   - Ficha completa: precio, área, tipo, score badge
   - Mapa pequeño centrado en el inmueble
   - Sección "Análisis": valor estimado vs precio publicado (brecha),
     yield, cap rate, nivel de riesgo
   - Sección "Por qué este score": gráfico de barras con valores SHAP
   - Sección "Comparables": tabla con 5 inmuebles similares
   - Botón "Descargar reporte PDF"

3. /watchlist:
   - Lista de búsquedas guardadas
   - Alertas recientes (badge con conteo)
   - Botón "Nueva búsqueda"

Usar shadcn/ui para componentes base. Mapas con MapLibre GL JS + tiles
de OpenStreetMap (gratuitos). Gráficos con Recharts.
Todo responsive (mobile-first aunque el usuario principal es desktop).
```

#### Entregables de la Fase 7

- [ ] Swagger en `http://localhost:3001/api/docs` lista todos los endpoints
- [ ] Dashboard carga el mapa con pines de inmuebles
- [ ] Filtros funcionan y actualizan el mapa y la tabla
- [ ] Ficha de inmueble muestra score, SHAP y comparables
- [ ] "Descargar reporte PDF" genera y descarga un PDF con el análisis
- [ ] Watchlist guarda y recupera búsquedas
- [ ] Alertas se generan cuando aparecen inmuebles que cumplen criterios guardados

---

### FASE 8 — Validación, Pruebas y Cierre
**Duración estimada:** 1–2 sesiones  
**Objetivo:** Sistema validado, documentado y listo para uso.

#### Prompt de inicio

```
Fase 8 (Validación y cierre). El sistema está funcionalmente completo.
Necesitamos validar calidad, corregir bugs y documentar.

Checklist de validación:
1. Tests automatizados:
   - Backend NestJS: jest, cobertura > 60% en módulos críticos
   - Motor FastAPI: pytest, test de cada endpoint de analytics
   - Test de integración: flujo completo scraping → analytics → API → UI

2. Validación de modelos:
   - Comparar valor_estimado de 10 inmuebles con avalúos catastrales reales
   - Verificar que la distribución de scores es razonable (no todos 90+)
   - Verificar que NSGA-II retorna resultados coherentes con los filtros

3. Performance básica:
   - GET /api/inmuebles con 500 inmuebles: < 500ms
   - Carga del mapa con 500 pines: < 3 segundos
   - Generación de PDF: < 5 segundos

4. Documentación:
   - README actualizado con instrucciones completas
   - CLAUDE.md con estado final
   - Manual de usuario (Markdown, 1–2 páginas)
   - Decisiones de arquitectura documentadas en docs/decisiones/

5. Copia de seguridad:
   - Script de backup de PostgreSQL
   - Instrucciones para restaurar desde backup
```

#### Entregables de la Fase 8

- [ ] `npm run test` en backend: todos los tests pasan
- [ ] `pytest` en analytics: todos los tests pasan
- [ ] Comparación de 10 inmuebles: desviación promedio < 30% vs avalúo catastral
- [ ] Tiempo de respuesta API < 500ms en endpoints principales
- [ ] README completo y claro para que otro desarrollador pueda arrancar el sistema
- [ ] Script de backup funciona: `./scripts/backup.sh` crea un .sql comprimido

---

## 5. PROTOCOLO DE FEEDBACK ENTRE FASES

Al completar cada fase, antes de iniciar la siguiente, ejecutar este protocolo:

### 5.1 Template de informe de cierre de fase

Crear `docs/fases/fase_XX_completada.md` con esta estructura:

```markdown
# Fase XX — [Nombre] — Completada

**Fecha:** YYYY-MM-DD  
**Sesiones utilizadas:** N  
**Estado:** ✅ Completada / ⚠️ Completada con deuda técnica

## Entregables completados
- [x] Entregable 1
- [x] Entregable 2
- [ ] Entregable 3 — NO completado (razón: ...)

## Métricas obtenidas
(Resultados de los tests de la fase)
- Registros en DB: XXX
- Cobertura de tests: XX%
- Performance: XXXms

## Problemas encontrados y soluciones aplicadas
1. Problema: ...
   Solución: ...
   
## Deuda técnica generada
- [ ] Item de deuda 1
- [ ] Item de deuda 2

## Cambios al plan original
(Si se tomaron decisiones diferentes a las planeadas, documentarlas aquí)

## Estado del sistema al final de la fase
docker compose ps output:
[pegar output]

## Próximos pasos (Fase XX+1)
- Objetivo principal: ...
- Consideraciones especiales: ...
```

### 5.2 Actualización del CLAUDE.md después de cada fase

Ver sección 7 para el protocolo detallado.

### 5.3 Criterio de avance

**Una fase se considera "completa y aprobada" cuando:**
1. Todos los entregables marcados como críticos (sin los cuales la siguiente fase no funciona) están completos.
2. Los tests de la fase pasan sin errores.
3. El informe de cierre está documentado.
4. El CLAUDE.md está actualizado.

**Si hay entregables incompletos no críticos:** documentarlos como deuda técnica y avanzar, pero registrarlos en el CLAUDE.md.

---

## 6. ESTRATEGIA DE TESTING POR CAPA

### 6.1 Base de datos (PostGIS)

```sql
-- Siempre correr estas queries de sanidad antes de avanzar de fase
-- Integridad espacial
SELECT count(*) FROM inmueble WHERE NOT ST_IsValid(geom) AND geom IS NOT NULL;
-- Esperado: 0

-- Rango de coordenadas (deben estar en Colombia ~3°N–12°N, 67°W–79°W)
SELECT 
  min(ST_X(geom)) as lon_min, max(ST_X(geom)) as lon_max,
  min(ST_Y(geom)) as lat_min, max(ST_Y(geom)) as lat_max
FROM inmueble WHERE geom IS NOT NULL;
-- Esperado: lon entre -79 y -67, lat entre 3 y 13

-- Duplicados
SELECT url_anuncio, count(*) FROM inmueble 
GROUP BY url_anuncio HAVING count(*) > 1;
-- Esperado: 0 filas
```

### 6.2 Motor analítico (Python/FastAPI)

```python
# analytics/tests/test_pipeline.py
def test_health():
    response = client.get("/health")
    assert response.status_code == 200

def test_valor_estimado_rango():
    """El valor estimado debe estar en un rango razonable para Colombia"""
    result = db.execute("SELECT avg(valor_estimado) FROM analisis_inmueble")
    avg = result.scalar()
    # Apartamentos en Bucaramanga: entre $80M y $800M COP
    assert 80_000_000 < avg < 800_000_000

def test_score_distribucion():
    """El score debe distribuirse, no estar todo en extremos"""
    result = db.execute("""
        SELECT 
          count(*) filter (where score < 20) as bajo,
          count(*) filter (where score between 20 and 80) as medio,
          count(*) filter (where score > 80) as alto
        FROM analisis_inmueble
    """)
    row = result.fetchone()
    assert row.medio > (row.bajo + row.alto)  # La mayoría debe estar en el medio

def test_shap_sum_aproxima_prediccion():
    """La suma de valores SHAP debe aproximar la predicción"""
    # SHAP property: sum(shap_values) ≈ prediction - expected_value
    pass  # Implementar con datos reales
```

### 6.3 Backend NestJS

```typescript
// backend/src/inmuebles/inmuebles.controller.spec.ts
describe('InmueblesController', () => {
  it('GET /api/inmuebles retorna lista paginada', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/inmuebles?page=1&limit=20')
      .expect(200);
    expect(response.body.data).toBeInstanceOf(Array);
    expect(response.body.total).toBeGreaterThan(0);
    expect(response.body.data[0]).toHaveProperty('score');
  });

  it('GET /api/inmuebles filtra por precio', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/inmuebles?precio_max=300000000')
      .expect(200);
    response.body.data.forEach(i => {
      expect(i.precio).toBeLessThanOrEqual(300_000_000);
    });
  });
});
```

### 6.4 Frontend (E2E básico con Playwright)

```typescript
// frontend/tests/dashboard.spec.ts
test('carga el dashboard con mapa', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-testid="inmueble-count"]')).not.toBeEmpty();
});

test('filtro de precio actualiza la tabla', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.fill('[data-testid="precio-max-input"]', '200000000');
  await page.click('[data-testid="aplicar-filtros"]');
  const precios = await page.locator('[data-testid="precio-inmueble"]').allTextContents();
  // Verificar que todos los precios son <= 200M
});
```

---

## 7. GUÍA DE ACTUALIZACIÓN DEL CLAUDE.md

El CLAUDE.md es el "cerebro persistente" del proyecto entre sesiones. Actualizarlo es obligatorio al cerrar cada fase.

### 7.1 Qué actualizar en el CLAUDE.md

**Al completar una fase, actualizar las siguientes secciones:**

1. **Estado de fases:** cambiar ⬜ por ✅ y agregar la fecha de cierre.

2. **Sección de estado actual** (agregar o actualizar):
```markdown
## ESTADO ACTUAL DEL SISTEMA (actualizado FECHA)

### Datos disponibles
- inmueble: XXX registros, XX% con geom
- proyecto_pot: XX registros  
- capa_riesgo: XX polígonos
- analisis_inmueble: XXX con score calculado

### Modelos activos
- Estimación de valor: [nombre modelo] — RMSE: XXX, R²: 0.XX
- Segmentación: K-means k=X — Silueta: 0.XX
- Clasificador: LogisticRegression — AUC: 0.XX

### Problemas conocidos
- [listar bugs conocidos, limitaciones, workarounds activos]
```

3. **Comandos frecuentes:** si se agregan nuevos scripts o comandos útiles durante la fase, documentarlos.

4. **Deuda técnica:** agregar los items nuevos identificados en la fase.

### 7.2 Prompt para que Claude Code ayude a actualizar el CLAUDE.md

```
Terminamos la Fase X. Necesito actualizar el CLAUDE.md.
Lee el estado actual del sistema (docker compose ps, las queries de
sanidad de la base de datos) y actualiza el CLAUDE.md con:
1. La fase X marcada como completada con la fecha de hoy
2. El estado actual de los datos (conteos de registros)
3. Las métricas de los modelos activos (si aplica)
4. Los problemas conocidos que identificamos en la sesión
5. Cualquier decisión técnica nueva que tomamos

No cambies las secciones de arquitectura ni las convenciones, solo
actualiza las secciones de estado.
```

---

## 8. CHECKLIST DE CIERRE DE SESIÓN

Ejecutar antes de cerrar cualquier sesión de Claude Code, independiente de si se completó la fase o no:

```bash
#!/bin/bash
# scripts/cierre_sesion.sh
echo "=== CHECKLIST CIERRE DE SESIÓN DataRaíz ==="
echo ""
echo "1. Estado de contenedores:"
docker compose ps

echo ""
echo "2. Últimas líneas de logs (errores):"
docker compose logs --tail=20 2>&1 | grep -E "(ERROR|WARN|error|warn)" || echo "No hay errores recientes"

echo ""
echo "3. Conteos de datos:"
docker compose exec db psql -U dataraiz -d dataraiz_db -c "
  SELECT 
    (SELECT count(*) FROM inmueble) as inmuebles,
    (SELECT count(*) FROM analisis_inmueble WHERE score IS NOT NULL) as con_score,
    (SELECT count(*) FROM comparable) as comparables;
"

echo ""
echo "4. Cambios sin commitear:"
git status --short

echo ""
echo "5. ¿Hacer commit? (s/n)"
read RESP
if [ "$RESP" = "s" ]; then
  git add -A
  echo "Mensaje de commit (incluir fase y qué se hizo):"
  read MSG
  git commit -m "$MSG"
  echo "✅ Commit guardado"
fi

echo ""
echo "CHECKLIST MANUAL:"
echo "[ ] CLAUDE.md actualizado con el progreso de la sesión"
echo "[ ] Deuda técnica nueva documentada"
echo "[ ] Si se completó la fase: docs/fases/fase_XX_completada.md creado"
echo "[ ] .env no está en git (verificar con: git ls-files .env)"
```

---

## 9. RIESGOS Y MITIGACIONES

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| Fincaraíz bloquea el scraper (captcha, bloqueo IP) | Alta | Alto | Respetar robots.txt y rate limits desde el inicio. Tener Metrocuadrado como backup. Agregar delays aleatorios. Rotar user-agents. |
| Datos del POT de Bucaramanga en formato no estándar o desactualizado | Media | Medio | Descargar múltiples versiones. GeoPandas maneja la mayoría de formatos. Fallback: usar datos de OSM. |
| R² < 0.50 con pocos datos del piloto | Alta | Medio | Aceptable en MVP; documentar limitación. Con ≥ 500 inmuebles mejora. Usar validación cruzada. |
| Playwright no puede navegar portales con heavy JS | Media | Alto | Probar portales en Fase 1. Alternativa: buscar si existe API no oficial o dataset público. |
| Docker consume demasiada RAM en servidor con 8GB | Media | Alto | Limitar memoria por contenedor en docker-compose.yml (`mem_limit: 2g`). Deshabilitar scrapers cuando no se usen. |
| NSGA-II tarda más de 10s con muchos inmuebles | Baja | Bajo | Limitar población y generaciones. Filtrar previamente por zona/tipo antes de optimizar. |
| Sesión de Claude Code "pierde contexto" en conversaciones largas | Alta | Medio | Por eso existe el CLAUDE.md. Incluir resumen del estado al inicio de cada sesión. Dividir fases grandes en sub-sesiones. |

---

## APÉNDICE A — .env.example

```bash
# Base de datos
POSTGRES_DB=dataraiz_db
POSTGRES_USER=dataraiz
POSTGRES_PASSWORD=dataraiz_dev_password_2024
DATABASE_URL=postgresql://dataraiz:dataraiz_dev_password_2024@db:5432/dataraiz_db

# Redis
REDIS_URL=redis://redis:6379

# Servicios internos
ANALYTICS_URL=http://analytics:8000
BACKEND_URL=http://backend:3001

# Scraping
SCRAPING_INTERVAL_HOURS=6
SCRAPING_RATE_LIMIT_MS=1000
PILOT_CITIES=bucaramanga,floridablanca,giron,piedecuesta

# Scoring (pesos, deben sumar 1.0)
SCORE_W_OPORTUNIDAD=0.30
SCORE_W_BRECHA=0.25
SCORE_W_YIELD=0.25
SCORE_W_RIESGO=0.10
SCORE_W_COMPS=0.10

# JWT (cambiar en producción)
JWT_SECRET=dataraiz_jwt_secret_dev_only
JWT_EXPIRES_IN=7d

# Coordenadas centro de referencia (Plaza de los Búcaros, Bucaramanga)
CENTRO_LAT=7.1197
CENTRO_LNG=-73.1227

# SRID para cálculos de distancia en Colombia
SRID_COLOMBIA=9377

# Desarrollo
NODE_ENV=development
LOG_LEVEL=debug
```

---

## APÉNDICE B — docker-compose.yml base

```yaml
version: '3.9'

services:
  db:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/migrations:/docker-entrypoint-initdb.d:ro
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s

  analytics:
    build: ./analytics
    environment:
      DATABASE_URL: ${DATABASE_URL}
      LOG_LEVEL: ${LOG_LEVEL}
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - ./analytics:/app
      - analytics_models:/app/app/models

  backend:
    build: ./backend
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      ANALYTICS_URL: ${ANALYTICS_URL}
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "3001:3001"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  scrapers:
    build: ./scrapers
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      SCRAPING_RATE_LIMIT_MS: ${SCRAPING_RATE_LIMIT_MS}
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
      NEXT_PUBLIC_MAP_CENTER_LAT: ${CENTRO_LAT}
      NEXT_PUBLIC_MAP_CENTER_LNG: ${CENTRO_LNG}
    ports:
      - "3000:3000"
    depends_on:
      - backend

volumes:
  postgres_data:
  redis_data:
  analytics_models:
```

---

*Documento generado para el proyecto DataRaíz — Universidad INCCA de Colombia*  
*Electiva de Profundización I — 2025*
