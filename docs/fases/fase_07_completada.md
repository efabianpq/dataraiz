# Fase 7 — Aplicación (UI + API) · Cierre

> Fecha: 2026-06-10
> Estado: ✅ Completada

Construcción de la capa de aplicación de DataRaíz: API REST en NestJS que expone
los resultados precalculados, y dashboard Next.js con el branding de la marca.

---

## Sub-fase 7A — API REST NestJS

Toda la API vive bajo el prefijo `/api`; `health` se excluye del prefijo para no
romper los healthchecks. Documentación Swagger en `http://localhost:3001/api/docs`.

### Endpoints (13 rutas)

| Método | Ruta | Auth | Descripción |
|--------|------|------|-------------|
| POST | `/api/auth/login` | — | Login admin → JWT |
| GET | `/api/inmuebles` | pública | Lista paginada + filtros, orden `score DESC` |
| GET | `/api/inmuebles/:id` | pública | Ficha completa: análisis, SHAP, comparables, zona |
| GET | `/api/inmuebles/:id/reporte` | JWT | PDF del análisis (`@react-pdf/renderer`) |
| POST | `/api/watchlist` | JWT | Guardar búsqueda |
| GET | `/api/watchlist` | JWT | Listar búsquedas |
| DELETE | `/api/watchlist/:id` | JWT | Eliminar búsqueda |
| GET | `/api/alertas` | JWT | Alertas no vistas + datos del inmueble |
| PUT | `/api/alertas/:id/vista` | JWT | Marcar alerta como vista |
| POST | `/api/optimizar` | JWT | Proxy NSGA-II a FastAPI |
| POST | `/api/scraping/run`, GET `/status/:jobId` | — | (Fase 1, sin cambios) |
| GET | `/health` | — | Healthcheck (fuera de `/api`) |

### Decisiones técnicas

- **Acceso a datos:** `DatabaseModule` global con `pg.Pool` y SQL crudo (sin ORM).
  El backend **solo lee** resultados precalculados; las únicas escrituras son a
  `watchlist` y `alerta`. lat/lng se derivan con `ST_X/ST_Y(geom)`. El filtro
  `nivel_riesgo` se interpreta como "máximo aceptado" (rango bajo<medio<alto).
- **Autenticación:** JWT (`@nestjs/jwt` + `passport-jwt`). Usuario único `admin`
  validado contra `ADMIN_PASSWORD` (env). El payload usa `sub=1`, el usuario
  admin sembrado por la migración **009** (necesario para las FK `usuario_id` de
  watchlist/alerta). Endpoints públicos: lista y ficha de inmuebles.
- **PDF:** `@react-pdf/renderer` (no puppeteer). Se construye con
  `React.createElement` para evitar habilitar JSX en el `tsconfig` del backend.
  Incluye datos del inmueble, score, brecha, yield, cap rate, riesgo, top-5 SHAP
  y comparables. `Content-Type: application/pdf` + `Content-Disposition: attachment`.
- **Optimización:** único punto donde el backend llama a FastAPI (`@nestjs/axios`),
  porque el frente de Pareto se calcula bajo demanda y no está precalculado.
- **Validación:** `class-validator` + `ValidationPipe` global (transform/whitelist).

### Verificación 7A

- `curl /api/inmuebles?limit=5` → JSON paginado válido.
- Ficha `/api/inmuebles/61` → 32 campos + `shap_json` (7 features) + 5 comparables.
- Login → JWT (163 chars); watchlist sin token → 401; CRUD watchlist OK.
- PDF inmueble 61 → 5432 bytes, `PDF document, 1 page`.
- Proxy `/api/optimizar` → `n_frente=3`.
- Swagger `/api/docs` → 200, 13 paths.

---

## Sub-fase 7B — Dashboard Next.js

Next.js 16 (App Router, Turbopack), Tailwind CSS v4, TypeScript estricto.

### Branding

- Tokens del Brand Guide en `src/app/globals.css` dentro de `@theme` (fuente de
  verdad de Tailwind v4) y espejados en `tailwind.config.js` (documentación).
  Paletas brand/amber/terra/data/neutral, escala tipográfica
  (display→caption), sombras semánticas (card/panel/modal/pin), espaciado
  (`sidebar` 248px, `header` 60px, `panel-p` 24px).
- Fuentes Plus Jakarta Sans + JetBrains Mono vía `next/font/google` (12
  `@font-face` self-hosted).
- Logo `public/logo.svg`: isotipo de 3 barras de datos sobre una raíz ámbar,
  extraído del Brand Guide.

### Páginas

1. **`/`** — sidebar de filtros (fondo brand-800) con precio, tipo, score
   mínimo, riesgo máximo y zonas; botones "Aplicar filtros" (amber) y "Optimizar
   con NSGA-II". Área principal: mapa MapLibre (markers coloreados por score con
   popups "Ver detalle") + tabla top-20 con sort. Los filtros multi (tipo/zona)
   se refinan en cliente sobre un fetch amplio (limit 300) y son bookmarkeables
   con `useSearchParams`.
2. **`/inmueble/[id]`** — breadcrumb, precio en display, score badge 64px, señal
   Comprar/Mantener/Vigilar/Evitar, mini-mapa, 4 tarjetas financieras (valor
   estimado, brecha, yield, cap rate), riesgo territorial, **gráfico SHAP
   (Recharts, barras horizontales verde/terracota)**, tabla de comparables y
   botón flotante "Descargar reporte PDF".
3. **`/watchlist`** — alertas no vistas (marcar vista), búsquedas guardadas
   (aplicar al mapa / eliminar con confirmación) y modal de nueva búsqueda.

### Decisiones técnicas

- **shadcn/ui:** se construyeron primitivos propios (`src/components/ui.tsx`,
  `Dialog.tsx`) equivalentes a Button/Card/Badge/Select/Slider/Dialog/Table/
  Input/Checkbox con los tokens de marca, en vez del CLI de shadcn (frágil con
  Tailwind v4 e init interactivo en contenedor).
- **MapLibre** con `next/dynamic` (`ssr:false`). Estilo `openfreemap/liberty`
  con fallback a `demotiles` ante error. Markers HTML coloreados por score.
- **Cliente API** (`src/lib/api.ts`): auto-login admin (no hay pantalla de
  login en el MVP), token en `localStorage`, re-autenticación ante 401.

### Verificación 7B

- `GET /`, `/inmueble/61`, `/watchlist` → 200, sin errores en logs.
- `tsc --noEmit` → 0 errores.
- CSS compilado contiene los tokens de marca (`#1b4d3e`, `#d4943a`, `248px`,
  variable `jakarta`).

---

## Variables de entorno nuevas

```
ADMIN_PASSWORD=dataraiz_admin_2026          # backend (login admin)
NEXT_PUBLIC_ADMIN_USER=admin                # frontend (auto-login)
NEXT_PUBLIC_ADMIN_PASSWORD=dataraiz_admin_2026
```
(añadidas a `.env`, `.env.example` y al `docker-compose.yml`).

## Migraciones

- **009_usuario_admin.sql** — siembra el usuario admin (id=1) para las FK de
  watchlist/alerta. Idempotente (`ON CONFLICT (email) DO NOTHING`).

## Pendientes hacia Fase 8

- Validación funcional visual end-to-end en navegador (mapa, SHAP, descarga PDF).
- Las zonas tienen `precio_m2_mediano = NULL` (no calculado); la comparación
  "vs promedio de zona" en la ficha queda vacía hasta poblarlo.
- Auth real (pantalla de login) si se habilita multi-tenencia.
