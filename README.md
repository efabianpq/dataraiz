# DataRaíz

Plataforma de apoyo a decisiones de inversión inmobiliaria para el Área
Metropolitana de Bucaramanga (Bucaramanga, Floridablanca, Girón y
Piedecuesta). Integra datos de portales inmobiliarios, catastro, Plan de
Ordenamiento Territorial (POT), proyectos de infraestructura y variables de
riesgo para entregar análisis de valor, brecha de precio, comparables y un
**score de oportunidad (0–100)** por inmueble, con explicaciones SHAP y
optimización de portafolio (frente de Pareto, NSGA-II).

> Estado: **MVP completo (Fases 0–8 cerradas).** Ver [CLAUDE.md](./CLAUDE.md)
> para el contexto técnico completo, [docs/fases/](./docs/fases/) para los
> informes de cada fase y [docs/manual_usuario.md](./docs/manual_usuario.md)
> para la guía de uso del dashboard.

## Arquitectura

| Servicio   | Tecnología              | Puerto | Descripción                      |
|------------|-------------------------|--------|-----------------------------------|
| frontend   | Next.js 16 + Tailwind   | 3000   | Dashboard interactivo + mapa      |
| backend    | NestJS 11 (TypeScript)  | 3001   | API REST, lógica de negocio       |
| analytics  | FastAPI (Python 3.11)   | 8000   | Motor ML: modelos, scoring, SHAP  |
| scrapers   | Playwright (Node.js)    | —      | Worker de scraping programado     |
| db         | PostgreSQL 16 + PostGIS | 5432   | Base de datos geoespacial         |
| redis      | Redis 7                 | 6379   | Cola BullMQ + caché               |

Todos los servicios corren como contenedores Docker orquestados por Docker
Compose en una sola máquina (WSL2 Ubuntu 22.04).

### Cómo fluyen los datos

```
scrapers (Fincaraíz, @Cron)  ──►  inmueble (PostGIS, puntos 4326)
                                        │
        motor analytics (FastAPI) ──────┤  precalcula y persiste en analisis_inmueble:
                                        │   geoprocesar → entrenar → segmentar →
                                        │   clasificar → financiero → score → shap
                                        ▼
        backend (NestJS) ── SOLO LEE ── analisis_inmueble / comparable / zona
                                        │  (escribe únicamente watchlist y alerta)
                                        ▼
        frontend (Next.js) ── dashboard + mapa + ficha + reporte PDF
```

El backend **no recalcula** en cada petición: sirve resultados precalculados.
El único cálculo bajo demanda es el frente de Pareto (NSGA-II), que el backend
delega al motor analytics vía `POST /api/optimizar`.

## Requisitos previos

- Docker y Docker Compose
- ~4 GB de RAM libres para los 6 contenedores
- Node.js 20+ y Python 3.11 (solo si se quiere ejecutar algo fuera de los
  contenedores)

## Puesta en marcha (desde cero)

1. **Variables de entorno.** Copiar la plantilla y ajustar secretos:

   ```bash
   cp .env.example .env
   # Editar al menos JWT_SECRET y ADMIN_PASSWORD antes de exponer el servicio.
   ```

2. **Levantar todos los servicios** (la primera vez construye las imágenes):

   ```bash
   docker compose up -d --build
   ```

   Al inicializar la base de datos vacía se aplican automáticamente las
   migraciones `database/migrations/001…009` (extensión PostGIS, esquema, datos
   semilla, SRID 9377, columnas de cada fase y usuario admin).

3. **Verificar que todo responde:**

   ```bash
   curl http://localhost:3001/health   # backend   -> {"status":"ok"}
   curl http://localhost:8000/health   # analytics -> {"status":"ok"}
   curl -o /dev/null -w "%{http_code}\n" http://localhost:3000   # frontend -> 200
   ```

4. **Cargar datos y correr el pipeline analítico.** En un entorno nuevo la tabla
   `inmueble` está vacía: primero se ejecuta el scraper y luego la cadena de
   análisis (ver la sección siguiente).

5. **Abrir el dashboard:** http://localhost:3000
   La documentación interactiva de la API (Swagger) está en
   http://localhost:3001/api/docs.

## Pipeline analítico (recálculo)

Cuando el scraper agrega o actualiza inmuebles, hay que recorrer la cadena para
poblar `analisis_inmueble`. **El orden importa** (cada paso depende del
anterior). Todo se dispara contra el motor FastAPI:

```bash
# 1. Disparar el scraping (o esperar al @Cron del backend)
curl -X POST http://localhost:3001/api/scraping/run

# 2. Cadena de análisis (en orden)
curl -X POST http://localhost:8000/analytics/geoprocesar     # variables espaciales
curl -X POST http://localhost:8000/analytics/entrenar        # modelo de valor (XGBoost)
curl -X POST http://localhost:8000/analytics/segmentar       # K-means + comparables
curl -X POST http://localhost:8000/analytics/clasificar      # prob. de oportunidad
curl -X POST http://localhost:8000/analytics/financiero      # canon, yield, cap rate
curl -X POST http://localhost:8000/analytics/calcular_score  # score integrado 0–100
curl -X POST http://localhost:8000/analytics/calcular_shap   # explicaciones SHAP
```

## Uso de la API

La API vive bajo el prefijo `/api`. Rutas públicas: el listado y la ficha de
inmuebles. El resto requiere un token JWT:

```bash
# Login (usuario único admin; la contraseña es ADMIN_PASSWORD del .env)
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"usuario":"admin","password":"<ADMIN_PASSWORD>"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")

curl "http://localhost:3001/api/inmuebles?limit=20&score_min=70"   # público
curl "http://localhost:3001/api/inmuebles/1"                        # público (ficha + SHAP)
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/inmuebles/1/reporte" -o reporte.pdf    # protegido (PDF)
```

## Comandos frecuentes

```bash
docker compose up -d                       # levantar todo
docker compose logs -f [servicio]          # ver logs en tiempo real
docker compose restart analytics           # reiniciar un servicio
docker compose exec db psql -U dataraiz -d dataraiz_db   # consola SQL

docker compose exec backend npm run test          # tests del backend (Jest)
docker compose exec backend npm run test:cov       # backend con cobertura
docker compose exec analytics pytest -v            # tests del motor analítico

./scripts/backup.sh                        # respaldo comprimido de la DB
./scripts/restore.sh backups/archivo.sql.gz   # restauración

docker compose down                        # detener todo
docker compose down -v                     # detener y BORRAR la DB (reinicia de cero)
```

## Tests

- **Backend (Jest):** servicios y controladores de los módulos críticos
  (inmuebles, watchlist, reportes/PDF, proxy de optimización, alertas, auth)
  con cobertura > 60 % en cada módulo crítico.
- **Analytics (pytest):** integración de todos los endpoints del motor
  (geoprocesamiento, modelo de valor, segmentación, oportunidad/finanzas,
  scoring, SHAP, optimización) más guardas de regresión del filtro de outliers.

## Respaldo y restauración

`scripts/backup.sh` genera un `pg_dump` comprimido (`backups/*.sql.gz`).
`scripts/restore.sh` lo restaura sobre la base de datos. Ver la cabecera de cada
script para los detalles y advertencias.

## Estructura del repositorio

```
dataraiz/
├── CLAUDE.md                   # contexto técnico del proyecto
├── docker-compose.yml
├── .env.example
├── README.md
├── frontend/                   # Next.js 16 (dashboard + mapa)
├── backend/                    # NestJS 11 (API REST, /api)
├── analytics/                  # FastAPI + Python 3.11 (motor ML)
├── scrapers/                   # Playwright (worker BullMQ)
├── database/migrations/        # 001_, 002_, ... (numeradas, no editar aplicadas)
├── scripts/                    # backup.sh, restore.sh
├── datos_oficiales/            # POT, catastro, capas de riesgo
└── docs/
    ├── manual_usuario.md       # guía de uso del dashboard
    ├── fases/                  # informes de cierre por fase
    ├── decisiones/             # decisiones de arquitectura (ADR)
    └── api/
```

## Acceso remoto

Para exponer el frontend local mediante HTTPS sin abrir puertos:

```bash
cloudflared tunnel --url http://localhost:3000
```

## Convenciones y decisiones

Ver [CLAUDE.md](./CLAUDE.md) para las convenciones de código (TypeScript,
Python, SQL/PostGIS) y las variables de entorno. Las decisiones de arquitectura
más importantes están documentadas como ADR en
[docs/decisiones/](./docs/decisiones/).
