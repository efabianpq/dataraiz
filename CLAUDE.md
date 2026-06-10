# CLAUDE.md — DataRaíz: Contexto del Proyecto

> Última actualización: 2026-06-09
> Fase actual: Fase 0 — Entorno y Esqueletos
> Estado: ✅ COMPLETADA — lista para iniciar Fase 1

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
| 1    | Ingesta de datos         | Pendiente    |
| 2    | Geoprocesamiento         | Pendiente    |
| 3    | Modelos de valor         | Pendiente    |
| 4    | Segmentación y comps     | Pendiente    |
| 5    | Oportunidad y finanzas   | Pendiente    |
| 6    | Score y optimización     | Pendiente    |
| 7    | Aplicación (UI + API)    | Pendiente    |
| 8    | Validación y cierre      | Pendiente    |

---

## ESTADO ACTUAL DEL SISTEMA (actualizado 2026-06-09)

### Stack
- Los 6 servicios levantan correctamente con `docker compose up -d --build`.
- backend (NestJS): `GET /health` → `{"status":"ok"}` en :3001
- analytics (FastAPI/Python 3.11): `GET /health` → `{"status":"ok"}` en :8000
- frontend (Next.js 16 + Turbopack): página "DataRaíz - En construcción" en :3000
- db (PostgreSQL 16 + PostGIS 3.4): 9 tablas del modelo de datos creadas vía
  migraciones 001-003, healthcheck OK
- redis (7-alpine): operativo, healthcheck OK
- scrapers: worker placeholder corriendo (heartbeat cada 60s); sin scrapers
  reales todavía (Fase 1A)

### Datos disponibles
- inmueble: 0 registros
- zona: 4 registros (bounding boxes provisionales de los 4 municipios piloto)
- proyecto_pot: 0 registros
- capa_riesgo: 0 polígonos
- analisis_inmueble: 0 registros

### Modelos activos
- Ninguno todavía (a partir de Fase 3)

### Problemas conocidos
- shadcn/ui no está configurado todavía (diferido a Fase 7B).

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
| analisis_inmueble | Resultados precalculados por inmueble    | inmueble_id, valor_estimado, brecha, score, shap_json              |
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
