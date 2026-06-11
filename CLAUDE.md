# CLAUDE.md — DataRaíz: Contexto del Proyecto

> Última actualización: 2026-06-10
> Fase actual: Fase 7 — Aplicación (UI + API)
> Estado: ✅ COMPLETADA — lista para iniciar Fase 8

---

## QUÉ ES ESTE PROYECTO

DataRaíz es una plataforma de apoyo a decisiones de inversión inmobiliaria para el
mercado colombiano. Integra datos de portales inmobiliarios, catastro, Plan de
Ordenamiento Territorial (POT), proyectos de infraestructura y variables de riesgo
para entregar al inversionista un sistema de apoyo a la decisión.

**Zona piloto:** Área Metropolitana de Bucaramanga (Bucaramanga, Floridablanca,
Girón, Piedecuesta).

**Usuario del sistema:** efabianpq — Claude Pro — Python 3.11 en WSL2 Ubuntu 22.04

---

## ARQUITECTURA

Todos los servicios corren como contenedores Docker orquestados por Docker Compose
en una sola máquina local (WSL2).

| Servicio   | Tecnología              | Puerto | Descripción                      |
|------------|-------------------------|--------|----------------------------------|
| frontend   | Next.js 16 + Tailwind   | 3000   | Dashboard interactivo + mapa     |
| backend    | NestJS 11 (TypeScript)  | 3001   | API REST, lógica de negocio      |
| analytics  | FastAPI (Python 3.11)   | 8000   | Motor ML: modelos, scoring, SHAP |
| scrapers   | Playwright (Node.js)    | —      | Worker de scraping programado    |
| db         | PostgreSQL 16 + PostGIS | 5432   | Base de datos geoespacial        |
| redis      | Redis 7                 | 6379   | Cola BullMQ + caché              |

---

## ESTADO DE FASES

| Fase | Nombre                   | Estado                  |
|------|--------------------------|--------------------------|
| 0    | Entorno y esqueletos     | ✅ Completada (2026-06-09) |
| 1    | Ingesta de datos         | ✅ Completada (2026-06-09) |
| 2    | Geoprocesamiento         | ✅ Completada (2026-06-09) |
| 3    | Modelos de valor         | ✅ Completada (2026-06-09) |
| 4    | Segmentación y comps     | ✅ Completada (2026-06-09) |
| 5    | Oportunidad y finanzas   | ✅ Completada (2026-06-09) |
| 6    | Score y optimización     | ✅ Completada (2026-06-10) |
| 7    | Aplicación (UI + API)    | ✅ Completada (2026-06-10) |
| 8    | Validación y cierre      | Pendiente    |

---

## ESTADO ACTUAL DEL SISTEMA (actualizado 2026-06-10)

### Resumen de cierre Fase 7 (2026-06-10)
**Sub-fase 7A — API REST NestJS** (todo bajo prefijo `/api`, Swagger en
`/api/docs`, 13 rutas mapeadas):
- `GET /api/inmuebles` — lista paginada con filtros (`precio_min/max`, `tipo`,
  `zona_id`, `score_min`, `nivel_riesgo`, `page`, `limit`), orden `score DESC
  NULLS LAST`; devuelve lat/lng (`ST_X/ST_Y`) + análisis. **Pública.**
- `GET /api/inmuebles/:id` — ficha completa: análisis, `shap_json`, zona y 5
  comparables. **Pública.**
- `GET /api/inmuebles/:id/reporte` — PDF con `@react-pdf/renderer` (sin
  puppeteer; React.createElement para no tocar la config JSX). **Protegida.**
- `POST/GET/DELETE /api/watchlist`, `GET /api/alertas`, `PUT /api/alertas/:id/vista`,
  `POST /api/optimizar` (proxy a `analytics:8000/analytics/optimizar`, NSGA-II).
  **Protegidas.**
- **Auth:** JWT (`@nestjs/jwt` + `passport-jwt`), usuario único `admin` validado
  contra `ADMIN_PASSWORD` (env); `POST /api/auth/login`. El payload usa
  `sub=1` (usuario admin sembrado por migración 009) para las FK de
  watchlist/alerta. `health` queda fuera del prefijo `/api` para los healthchecks.
- **Acceso a datos:** `DatabaseModule` global con `pg.Pool` y SQL crudo
  (el backend solo LEE; escribe únicamente watchlist/alerta). Validación con
  `class-validator` + `ValidationPipe` (transform/whitelist).
- Migración **009**: siembra `usuario` admin (id=1). Se sembraron 5 alertas de
  demostración para las top oportunidades (`prob_oportunidad > 0.7`).

**Sub-fase 7B — Dashboard Next.js 16 (App Router, Tailwind v4, TS estricto):**
- **Branding:** tokens del Brand Guide en `globals.css` (`@theme`, fuente de
  verdad de Tailwind v4) y espejados en `tailwind.config.js`. Colores
  brand/amber/terra/data/neutral, escala tipográfica, sombras (card/panel/
  modal/pin), espaciado (sidebar 248px, header 60px, panel-p 24px). Fuentes
  Plus Jakarta Sans + JetBrains Mono vía `next/font/google`. Logo en
  `public/logo.svg` (isotipo de 3 barras sobre raíz ámbar).
- **`/`** — sidebar de filtros (brand-800) + mapa MapLibre (markers coloreados
  por score, popups con "Ver detalle") + tabla top-20 (sort por score/precio/
  yield) + modal "Optimizar con NSGA-II". Filtros multi (tipo/zona) refinados
  en cliente sobre un fetch amplio; bookmarkeables vía `useSearchParams`.
- **`/inmueble/[id]`** — ficha: precio display, score badge, señal Comprar/
  Mantener/Vigilar/Evitar, mini-mapa, 4 tarjetas financieras, riesgo
  territorial, **gráfico SHAP (Recharts, barras horizontales)**, comparables, y
  botón flotante "Descargar reporte PDF".
- **`/watchlist`** — alertas no vistas (marcar vista) + búsquedas guardadas
  (aplicar al mapa / eliminar) + modal de nueva búsqueda.
- **Cliente API** `src/lib/api.ts`: auto-login admin (no hay pantalla de login),
  token en localStorage, re-auth en 401. Mapas con `next/dynamic` (`ssr:false`).
- Verificación: las 3 páginas responden 200, `tsc --noEmit` limpio, API probada
  end-to-end (login, CRUD watchlist, alertas, PDF 5.4 KB, proxy NSGA-II).
- Detalle completo en `docs/fases/fase_07_completada.md`
- Próxima fase: Fase 8 — Validación y cierre

### Resumen de cierre Fase 6 (2026-06-10)
- **Score integrado (0-100)** en `analisis_inmueble.score` para los inmuebles
  con datos completos (segmentos 0 y 1; atípicos con `score = NULL`). Fórmula =
  `100 * minmax(0.30·prob_oportunidad + 0.25·(-brecha_norm) + 0.25·yield_norm +
  0.10·(1-riesgo_norm) + 0.10·posicion_comp)`, **pesos configurables** vía
  `SCORE_W_*`. Distribución verificada: max=100, min=0, avg≈57.
- **SHAP** persistido en `analisis_inmueble.shap_json` para el mismo set (lista
  `{feature, value, impact}` ordenada por `abs(impact)` desc, 7 features del
  modelo de valor); limpia `shap_json` de inmuebles que dejan de tener datos
  completos. Explicador robusto: `TreeExplainer` para modelos de árbol,
  agnóstico como respaldo. Explican `log1p(precio)`.
- **Optimización NSGA-II (pymoo)** en `POST /analytics/optimizar`: frente de
  Pareto (max yield, min precio, min riesgo) filtrado por presupuesto/zonas/
  tipos/tolerancia de riesgo. Responde en **< 1 s** (corte 8 s, pop ≤ 50,
  n_gen=30), garantiza 3–20 inmuebles.
- Endpoints: `POST /analytics/calcular_score`, `POST /analytics/calcular_shap`,
  `GET /analytics/score/{id}/explicacion`, `POST /analytics/optimizar`.
- Migración 008: `CHECK` de rango (0-100) sobre `score`.
- **Fix infra:** `--reload-exclude *.joblib`/`*.json` en el Dockerfile de
  analytics (el watcher reiniciaba el servidor al escribir artefactos de modelo
  y cortaba las peticiones de entrenamiento/scoring por HTTP).
- Pipeline `analytics/app/pipelines/scoring.py`; tests en
  `tests/test_scoring.py` (9). **Suite analytics completa: 32 passed.**
- **Determinismo Fase 3 corregido:** los estimadores y las búsquedas de
  `modelos_valor.py` usan `n_jobs=1` (XGBoost `tree_method="exact"`); el
  reentrenamiento es reproducible bit a bit sobre un dataset fijo y el test
  `test_r2_supera_umbral` pasa.
- **Nota de datos:** el scraper @Cron se ejecutó durante la sesión y creció el
  dataset (315→519 inmuebles, `analisis_inmueble` 302→502). Tras re-correr la
  cadena: ~415 inmuebles con datos completos, modelo XGBoost R²≈0.66–0.73.
- Detalle completo en `docs/fases/fase_06_completada.md`
- Próxima fase: Fase 7 — Aplicación (UI + API)

### Resumen de cierre Fase 5 (2026-06-09)
- **Clasificador de oportunidad: StandardScaler → LogisticRegression
  (class_weight='balanced')**, AUC promedio (cv=5) = **0.9769** (> 0.65).
  Etiqueta `oportunidad=1` cuando `brecha < -10` y `posicion_vs_mediana =
  'debajo'` y `nivel_riesgo != 'alto'` → **25/302 (~8.3%)** positivos.
- **302/302 inmuebles con `prob_oportunidad`**; **21 con
  `prob_oportunidad > 0.7`** (oportunidades de alta confianza).
- **Capa financiera:** ratios canon/precio mensuales por segmento (segmento 0
  = 0.50%, segmento 1 = 0.45%; segmentos 2/3 excluidos por outliers extremos).
  **298/302 inmuebles con `canon_estimado_mensual`/`yield_bruto`/`cap_rate`**
  (4 excluidos). `yield_bruto` promedio = **5.801%**, `cap_rate` promedio =
  **4.931%** (ambos en rango razonable Colombia 4-10%).
- Artefacto en el volumen `analytics_models`:
  `clasificador_oportunidad.joblib` (+ `oportunidad.json`, `financiero.json`).
- Endpoints `POST /analytics/clasificar` y `POST /analytics/financiero`.
- Migración 007: `prob_oportunidad`, `canon_estimado_mensual`, `yield_bruto`,
  `cap_rate` en `analisis_inmueble`.
- Pipeline `analytics/app/pipelines/oportunidad_finanzas.py`; tests en
  `tests/test_oportunidad_finanzas.py` (8). Suite analytics: 23 passed.
- Detalle completo en `docs/fases/fase_05_completada.md`
- Próxima fase: Fase 6 — Score y optimización

### Resumen de cierre Fase 4 (2026-06-09)
- **Segmentación: StandardScaler → PCA(5, 84.1% varianza) → K-means k=4**,
  silueta=0.4316 (>0.30). k elegido por mayor silueta con desempate parsimonioso
  (`TOL_SILUETA=0.5%`): k=6 empata con k=4 por ruido (0.0006), se prefiere k=4.
- Conteo por segmento `{0:199, 1:99, 2:3, 3:1}`; segmentos 2/3 agrupan atípicos
  (rasgo de los datos, presente para cualquier k).
- **302/302 inmuebles con `segmento` y `posicion_vs_mediana`** en
  `analisis_inmueble` (138 `debajo` = oportunidades, 164 `encima`).
- **Tabla `comparable` poblada: 1510 filas** (5 comparables por inmueble) con
  `distancia_pca`, `dif_precio_m2`, `posicion_vs_mediana`. Selección en cascada:
  mismo tipo + zona ±1 → mismo segmento → todo el tipo.
- Artefactos en el volumen `analytics_models`: `scaler_segmentacion.joblib`,
  `pca_model.joblib`, `kmeans_model.joblib`, `segmentacion.json`.
- Endpoints `POST /analytics/segmentar` y `GET /analytics/segmentos`.
- Migración 006: `segmento`/`posicion_vs_mediana` en `analisis_inmueble`;
  `distancia_pca`/`posicion_vs_mediana` en `comparable`.
- Pipeline `analytics/app/pipelines/segmentacion.py`; tests en
  `tests/test_segmentacion.py` (7). Suite analytics: 15 passed.
- Detalle completo en `docs/fases/fase_04_completada.md`
- Próxima fase: Fase 5 — Oportunidad y finanzas

### Resumen de cierre Fase 3 (2026-06-09)
- **Modelo de valor activo: XGBoost**, R²=0.632, RMSE≈763M COP, MAE≈391M COP
  (n_train=229, n_test=58). Mejor de 4 modelos por RMSE.
- 302/302 inmuebles con features completos tienen `valor_estimado` y `brecha`
  en `analisis_inmueble` (17 muy subvalorados, 28 sobrevalorados)
- Target `precio` modelado en **espacio logarítmico** (`log1p`/`expm1`);
  `precio_m2` se usa solo para filtrar outliers, NO como feature (anti-leakage)
- Endpoints `POST /analytics/entrenar` y `GET /analytics/metricas`
- Modelos serializados en el volumen `analytics_models`: `best_model.joblib`,
  `preprocessor.joblib`, `metricas.json`
- Migración 005: `brecha` ampliada a NUMERIC(12,2); Dockerfile analytics con
  `libgomp1` (XGBoost)
- Detalle completo en `docs/fases/fase_03_completada.md`
- Próxima fase: Fase 4 — Segmentación y comparables

### Resumen de cierre Fase 2 (2026-06-09)
- **302/302 inmuebles con variables espaciales calculadas** y guardadas en
  `analisis_inmueble` (`dist_pot_m`, `en_zona_riesgo`, `nivel_riesgo`,
  `dist_centrocentro_m`, `zona_id`)
- **dist_pot_m promedio: 2178 m** (< 5000 m, criterio cumplido)
- **2 inmuebles en zona de riesgo `movimiento_masa`** (`en_zona_riesgo = true`)
- **SRID 9377 registrado manualmente en PostGIS** (MAGNA-SIRGAS 2018 /
  Origen-Nacional) vía migración `004_geoprocesamiento.sql`; la imagen
  `postgis/postgis:16-3.4` no lo trae
- Pipeline `analytics/app/pipelines/geoprocesamiento.py` (PostGIS-SQL +
  SQLAlchemy, lotes de 100, idempotente, structlog) y endpoint
  `POST /analytics/geoprocesar`
- Detalle completo en `docs/fases/fase_02_completada.md`
- **Próxima fase: Fase 3 — Modelos de valor de mercado**

### Resumen de cierre Fase 1
- 6 contenedores Docker corriendo (analytics y scrapers reconstruidos en
  esa fase)
- Scraper Fincaraíz (Playwright + BullMQ) operativo: 315 inmuebles cargados,
  302 con geometría (95.9%), 0 geometrías inválidas
- `POST /scraping/run` y `GET /scraping/status/:jobId` en el backend; job
  programado por `@Cron` cada `SCRAPING_INTERVAL_HOURS` horas
- Capas POT y riesgo del AMB (FeatureServer Floridablanca) cargadas en
  `proyecto_pot` (6825 registros) y `capa_riesgo` (2868 registros)
- Detalle completo en `docs/fases/fase_01_completada.md`

### Stack
- Los 6 servicios levantan correctamente con `docker compose up -d --build`.
- backend (NestJS): `GET /health` → `{"status":"ok"}` en :3001
- analytics (FastAPI/Python 3.11): `GET /health` → `{"status":"ok"}` en :8000;
  incluye `requests`, scikit-learn, XGBoost, pandas, numpy, joblib (+ `libgomp1`);
  monta `./datos_oficiales` y el volumen `analytics_models` (modelos entrenados)
- frontend (Next.js 16 + Turbopack): página "DataRaíz - En construcción" en :3000
- db (PostgreSQL 16 + PostGIS 3.4): 9 tablas del modelo de datos creadas vía
  migraciones 001-003, healthcheck OK
- redis (7-alpine): operativo, healthcheck OK
- scrapers: imagen `mcr.microsoft.com/playwright:v1.60.0-noble`, worker BullMQ
  (`startWorker`) escuchando la cola `scraping`, ejecuta `scrapeFincaraiz`

### Datos disponibles
- inmueble: 315 registros (fuente: fincaraiz; apto=105, casa=103, lote=84, local=23)
- zona: 4 registros (bounding boxes provisionales de los 4 municipios piloto)
- proyecto_pot: 6825 registros (tratamiento_urbanistico=3280, uso_suelo=3452,
  via_proyectada=93; cobertura principal Floridablanca)
- capa_riesgo: 2868 polígonos (categoria=movimiento_masa; bajo=612,
  medio=1187, alto=1069; cobertura principal Floridablanca)
- analisis_inmueble: 302 registros con variables espaciales (Fase 2) +
  `valor_estimado` y `brecha` (Fase 3) + `segmento` y `posicion_vs_mediana`
  (Fase 4) + `prob_oportunidad`, `canon_estimado_mensual`, `yield_bruto`,
  `cap_rate` (Fase 5; NULL para los inmuebles atípicos sin segmento 0/1) +
  `score` y `shap_json` (Fase 6; poblados para los 299 con datos completos,
  NULL para los atípicos)
- comparable: 1510 registros (5 comparables por inmueble) con `distancia_pca`,
  `dif_precio_m2`, `posicion_vs_mediana` (Fase 4)

### Modelos activos
- **Valor de mercado: XGBoost** (R²=0.632) en `analytics_models/best_model.joblib`
  + `preprocessor.joblib`. Re-entrenar con `POST /analytics/entrenar`.
- **Segmentación: PCA(5) + K-means k=4** (silueta=0.4316) en
  `analytics_models/{scaler_segmentacion,pca_model,kmeans_model}.joblib`.
  Recalcular segmentos y comparables con `POST /analytics/segmentar`.
- **Oportunidad: StandardScaler + LogisticRegression** (AUC cv=5 = 0.9769) en
  `analytics_models/clasificador_oportunidad.joblib`. Recalcular
  `prob_oportunidad` con `POST /analytics/clasificar`. Indicadores
  financieros (`canon_estimado_mensual`, `yield_bruto`, `cap_rate`) con
  `POST /analytics/financiero`.
- **Score integrado + SHAP (Fase 6):** `score` (0-100, pesos `SCORE_W_*`) y
  `shap_json` se recalculan con `POST /analytics/calcular_score` y
  `POST /analytics/calcular_shap`; resumen en `analytics_models/score.json`.
  El SHAP reutiliza el modelo de valor (`best_model.joblib`). Frente de Pareto
  bajo demanda con `POST /analytics/optimizar` (NSGA-II, pymoo).

### Problemas conocidos
- shadcn/ui: se optó por **primitivos UI propios** (`src/components/ui.tsx`,
  `Dialog.tsx`) equivalentes a Button/Card/Badge/Select/Slider/Dialog/Table/
  Input/Checkbox con los tokens de marca, en lugar del CLI de shadcn (frágil
  con Tailwind v4 + init interactivo en contenedor). Mismo resultado visual.
- Frontend: la autenticación es auto-login admin (sin pantalla de login) usando
  `NEXT_PUBLIC_ADMIN_USER/PASSWORD`. Aceptable para el MVP de un solo usuario;
  mover a un login real si se habilita multi-tenencia.
- `proyecto_pot`/`capa_riesgo` cubren principalmente Floridablanca; falta
  cobertura de Bucaramanga, Girón y Piedecuesta (ver deuda técnica de
  `docs/fases/fase_01_completada.md`). Impacto en Fase 2: solo 2 inmuebles
  marcan `en_zona_riesgo`, y `dist_pot_m` crece para inmuebles lejos de
  Floridablanca.
- 15 de 302 inmuebles quedan sin `zona_id` por caer fuera de las bounding
  boxes provisionales de `zona` (datos semilla de Fase 0).
- `datos_oficiales/catastro/` sigue vacío (sin fuente IGAC verificada).

### Nota PostGIS / SRID
- El SRID **9377** (MAGNA-SIRGAS 2018 / Origen-Nacional) NO viene en la imagen
  `postgis/postgis:16-3.4`; se registra en `spatial_ref_sys` vía la migración
  `004_geoprocesamiento.sql`. Es obligatorio para `ST_Transform(geom, 9377)`
  (distancias en metros). En un entorno nuevo, las migraciones 001-004 se
  aplican automáticamente al inicializar la DB.

---

## DECISIONES TÉCNICAS CLAVE

1. **Sin IA generativa de pago en el MVP.** Todo procesamiento con modelos locales
   de código abierto (scikit-learn, XGBoost, pymoo, SHAP). Claude API es mejora
   futura opcional.

2. **n8n reemplazado por @nestjs/schedule + BullMQ.** La orquestación vive en
   código TypeScript, versionable y testeable.

3. **MapLibre GL JS en lugar de Mapbox GL JS.** Fork open-source, sin costo.

4. **Frontend y backend en TypeScript.** Motor analítico en Python 3.11.
   Comunicación via HTTP entre NestJS y FastAPI.

5. **PostgreSQL + PostGIS es el núcleo.** Todos los resultados precalculados viven
   en la DB; el backend solo lee, no recalcula en cada petición.

6. **Python 3.11 explícito.** Usar siempre python3.11, no python3, porque el
   sistema tiene también Python 3.10 instalado.

---

## MODELO DE DATOS (entidades principales)

| Entidad           | Descripción                              | Campos clave                                                        |
|-------------------|------------------------------------------|---------------------------------------------------------------------|
| inmueble          | Anuncio capturado y normalizado          | id, tipo, precio, area_m2, habitaciones, geom (punto), fuente      |
| zona              | Unidad territorial (barrio/sector)       | id, nombre, geom (polígono), precio_m2_mediano                     |
| proyecto_pot      | Proyectos de infraestructura y POT       | id, tipo, estado, geom                                             |
| capa_riesgo       | Polígonos de amenaza/riesgo              | id, categoria, nivel, geom                                         |
| analisis_inmueble | Resultados precalculados por inmueble    | inmueble_id, dist_pot_m, en_zona_riesgo, nivel_riesgo, dist_centrocentro_m, zona_id (Fase 2); valor_estimado, brecha (Fase 3); segmento, posicion_vs_mediana (Fase 4); prob_oportunidad, canon_estimado_mensual, yield_bruto, cap_rate (Fase 5); score, shap_json (Fase 6) |
| comparable        | Relación inmueble con sus comps          | inmueble_id, comparable_id, distancia, dif_precio_m2               |
| usuario           | Inversionista registrado                 | id, nombre, email, preferencias                                    |
| watchlist         | Criterios guardados del usuario          | id, usuario_id, filtros_json, activa                               |
| alerta            | Notificaciones generadas                 | id, usuario_id, inmueble_id, fecha, estado                        |

---

## STACK TECNOLÓGICO COMPLETO

| Capa           | Tecnología                          | Justificación                              |
|----------------|-------------------------------------|--------------------------------------------|
| Frontend       | Next.js 16 + Tailwind + shadcn/ui   | TypeScript de punta a punta                |
| Backend / API  | NestJS 11 (TypeScript)              | Arquitectura modular, mismo lenguaje       |
| Motor ML       | Python 3.11 + scikit-learn + XGBoost + pymoo + SHAP (FastAPI) | Modelos locales gratuitos |
| Base de datos  | PostgreSQL 16 + PostGIS             | Núcleo geoespacial insustituible           |
| Orquestación   | @nestjs/schedule + BullMQ + Redis   | Sustituye a n8n                            |
| Scraping       | Playwright                          | Maneja portales con JavaScript dinámico    |
| Mapas          | MapLibre GL JS + tiles OSM          | Sin costo por carga de mapa                |
| Reportes       | Generación local de PDF             | Sin dependencias externas                  |
| Empaquetado    | Docker + Docker Compose             | Un comando levanta todo                    |
| Acceso remoto  | Cloudflare Tunnel                   | HTTPS sin abrir puertos                    |

---

## CONVENCIONES DE CÓDIGO

### TypeScript (frontend + backend)
- ESLint + Prettier configurados
- Imports con alias: `@/` para src/
- Funciones async/await, no callbacks
- Interfaces sobre types cuando sea posible
- Nombres en inglés para código, español para comentarios y logs

### Python (analytics)
- Black + isort para formato
- Type hints en todas las funciones públicas
- Pydantic para validación de entrada/salida en FastAPI
- Modelos entrenados se serializan con joblib en analytics/app/models/
- Usar siempre python3.11 explícitamente

### SQL / PostGIS
- Migraciones numeradas: 001_, 002_, etc.
- Nombres de tablas en español
- Geometrías en SRID 4326 (WGS84) para transferencia
- ST_Transform a 9377 (MAGNA-SIRGAS) para cálculos de distancia en metros

---

## VARIABLES DE ENTORNO REQUERIDAS (.env.example)

- DATABASE_URL — conexión PostgreSQL
- REDIS_URL — conexión Redis
- ANALYTICS_URL — URL interna del servicio FastAPI (http://analytics:8000)
- SCRAPING_INTERVAL_HOURS — frecuencia de scraping (default: 6)
- PILOT_CITIES — ciudades habilitadas (bucaramanga,floridablanca,giron,piedecuesta)
- JWT_SECRET — secreto para tokens de autenticación
- CENTRO_LAT=7.1197 — coordenadas Plaza de los Búcaros, Bucaramanga
- CENTRO_LNG=-73.1227
- SRID_COLOMBIA=9377

---

## COMANDOS FRECUENTES

```bash
# Levantar todo
docker compose up -d

# Ver logs en tiempo real
docker compose logs -f [servicio]

# Reiniciar un servicio
docker compose restart analytics

# Conectarse a la DB
docker compose exec db psql -U dataraiz -d dataraiz_db

# Correr tests del backend
docker compose exec backend npm run test

# Correr tests del motor analítico
docker compose exec analytics pytest -v

# Tunnel para acceso externo (solo cuando se necesita)
cloudflared tunnel --url http://localhost:3000
```

---

## ESTRUCTURA DEL REPOSITORIO

dataraiz/
├── CLAUDE.md
├── docker-compose.yml
├── .env.example
├── .env                        ← NO en git
├── .gitignore
├── README.md
├── frontend/                   ← Next.js 16
│   ├── Dockerfile
│   └── src/
├── backend/                    ← NestJS 11
│   ├── Dockerfile
│   └── src/
├── analytics/                  ← FastAPI + Python 3.11
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
├── scrapers/                   ← Playwright
│   ├── Dockerfile
│   └── src/
├── database/
│   └── migrations/
└── datos_oficiales/

---

## ARCHIVOS CRÍTICOS A NO MODIFICAR SIN REVISIÓN

- docker-compose.yml — cambios afectan todos los servicios
- database/migrations/ — nunca editar migraciones ya aplicadas; crear nuevas
- analytics/app/models/ — modelos entrenados; no eliminar sin respaldo
- .env — nunca subir a git

---

## DEUDA TÉCNICA Y MEJORAS FUTURAS (fuera del MVP)

- [ ] Integración con datos de notariado/registro para transacciones cerradas
- [ ] Cobertura de otras ciudades (Bogotá, Medellín, Cali)
- [ ] Capa Claude API para reportes en lenguaje natural
- [ ] Multi-tenencia por organización
- [ ] Migración a Google Cloud Run (fase SaaS)
