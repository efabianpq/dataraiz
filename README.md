# DataRaíz

Plataforma de apoyo a decisiones de inversión inmobiliaria para el Área
Metropolitana de Bucaramanga (Bucaramanga, Floridablanca, Girón y
Piedecuesta). Integra datos de portales inmobiliarios, catastro, Plan de
Ordenamiento Territorial (POT), proyectos de infraestructura y variables de
riesgo para entregar análisis de valor, brecha de precio, comparables y
score de oportunidad por inmueble.

> Estado actual: **Fase 0 — Entorno y Esqueletos**. Ver [CLAUDE.md](./CLAUDE.md)
> para el contexto completo del proyecto y el plan de desarrollo en
> [docs/DataRaiz_Plan_Desarrollo.md](./docs/DataRaiz_Plan_Desarrollo.md).

## Arquitectura

| Servicio   | Tecnología              | Puerto | Descripción                      |
|------------|-------------------------|--------|-----------------------------------|
| frontend   | Next.js 16 + Tailwind   | 3000   | Dashboard interactivo + mapa      |
| backend    | NestJS 11 (TypeScript)  | 3001   | API REST, lógica de negocio       |
| analytics  | FastAPI (Python 3.11)   | 8000   | Motor ML: modelos, scoring, SHAP  |
| scrapers   | Playwright (Node.js)    | —      | Worker de scraping programado     |
| db         | PostgreSQL 16 + PostGIS | 5432   | Base de datos geoespacial         |
| redis      | Redis 7                 | 6379   | Cola BullMQ + caché                |

Todos los servicios corren como contenedores Docker orquestados por Docker
Compose en una sola máquina (WSL2 Ubuntu 22.04).

## Requisitos previos

- Docker y Docker Compose
- Node.js 20+ y Python 3.11 (solo si se quiere ejecutar algo fuera de los
  contenedores)

## Puesta en marcha

1. Copiar el archivo de variables de entorno y ajustar valores si es necesario:

   ```bash
   cp .env.example .env
   ```

2. Levantar todos los servicios:

   ```bash
   docker compose up -d --build
   ```

3. Verificar que todo esté funcionando:

   ```bash
   curl http://localhost:3001/health   # backend  -> {"status":"ok"}
   curl http://localhost:8000/health   # analytics -> {"status":"ok"}
   curl http://localhost:3000          # frontend -> "DataRaíz"
   ```

4. Verificar la base de datos:

   ```bash
   docker compose exec db psql -U dataraiz -d dataraiz_db -c "\dt"
   docker compose exec db psql -U dataraiz -d dataraiz_db -c "SELECT PostGIS_Version();"
   ```

## Comandos frecuentes

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

# Detener todo
docker compose down

# Detener todo y borrar volúmenes (reinicia la DB desde cero)
docker compose down -v
```

## Estructura del repositorio

```
dataraiz/
├── CLAUDE.md
├── docker-compose.yml
├── .env.example
├── README.md
├── frontend/                   # Next.js 16
├── backend/                    # NestJS 11
├── analytics/                  # FastAPI + Python 3.11
├── scrapers/                   # Playwright
├── database/
│   ├── migrations/             # 001_, 002_, ... (numeradas, no editar aplicadas)
│   └── seeds/
├── datos_oficiales/            # POT, catastro, capas de riesgo
└── docs/
    ├── fases/
    ├── decisiones/
    └── api/
```

## Acceso remoto

Para exponer el frontend local mediante HTTPS sin abrir puertos:

```bash
cloudflared tunnel --url http://localhost:3000
```

## Convenciones

Ver [CLAUDE.md](./CLAUDE.md) para las convenciones de código (TypeScript,
Python, SQL/PostGIS), las decisiones técnicas clave y las variables de
entorno requeridas.
