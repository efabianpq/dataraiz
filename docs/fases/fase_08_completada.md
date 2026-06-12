# Fase 8 — Validación y Cierre — Completada

**Fecha:** 2026-06-11
**Sesiones utilizadas:** 1
**Estado:** ✅ Completada

Validación integral del MVP de DataRaíz (Fases 0–7 ya construidas): diagnóstico,
tests automatizados, validación de modelos, performance, documentación y
respaldos. Durante la validación se detectó y **corrigió** una degradación del
modelo de valor causada por el crecimiento del dataset vía scraping, y se
estabilizó la herramienta re-ejecutando toda la cadena analítica.

---

## Entregables completados

- [x] **Diagnóstico inicial:** 6 contenedores arriba, `/health` OK
      (backend/analytics) y 200 (frontend); PostGIS íntegro (0 geometrías
      inválidas); logs sin errores.
- [x] **`pytest` en analytics:** 34 tests pasan (incluye 2 nuevos de Fase 8).
- [x] **`npm run test` en backend:** 35 tests / 12 suites pasan.
- [x] **Cobertura > 60 % en módulos críticos:** inmuebles 89.7 %, reportes/PDF
      88.2 %, watchlist 82.4 %, proxy optimizar 78.1 %, alertas/auth 100 %.
- [x] **Validación de valor:** desviación vs mediana de comparables — muestra de
      10: 24.8 % prom.; global mediana 19.7 % (< 30 %).
- [x] **Distribución de scores razonable** (no todos altos ni bajos).
- [x] **NSGA-II coherente** con los filtros y < 0.3 s.
- [x] **Performance API < 500 ms** en todos los endpoints principales.
- [x] **README** completo de arranque para alguien nuevo.
- [x] **CLAUDE.md** con estado final de las 8 fases.
- [x] **Manual de usuario** (`docs/manual_usuario.md`).
- [x] **4 ADR** en `docs/decisiones/`.
- [x] **`scripts/backup.sh` + `scripts/restore.sh`**; backup ejecutado y
      verificado (6.6 MB `.sql.gz`, 9 tablas + datos).

> No se comparó contra **avalúo catastral** porque `datos_oficiales/catastro/`
> sigue vacío (sin fuente IGAC verificada, deuda heredada de Fase 1). Según lo
> previsto en el checklist, se usó el **precio mediano de los comparables** como
> referencia alternativa.

## Métricas obtenidas

**Datos en DB (al cierre):**
- inmueble: **720** (700 con geometría)
- analisis_inmueble: **700** con `valor_estimado`/`brecha`/`segmento`/
  `prob_oportunidad`; **684** con `score`+`shap_json` (segmentos 0/1); 16
  atípicos sin score por diseño; **267** oportunidades (`prob_oportunidad > 0.7`)
- comparable: 2510 · proyecto_pot: 6825 · capa_riesgo: 2868 · zona: 4

**Modelos (tras re-entrenar sobre 700 inmuebles):**
- Valor (XGBoost): **R²_cv = 0.638 ± 0.024** (5-fold), RMSE ≈ **350 M COP**,
  MAE ≈ **201 M COP** (antes del fix: R² split 0.49–0.59, RMSE ≈ 875 M).
- Segmentación (PCA + K-means): **k=6**, silueta **0.559**.
- Oportunidad (LogReg balanceada): AUC validado > 0.65 (test verde).
- Financiero: yield bruto promedio **5.6 %**, cap rate **4.8 %**.

**Cobertura de tests (módulos críticos, statements):**
inmuebles.service 100 % · reporte.service 88.2 % · watchlist.service 100 % ·
optimizar.service (proxy) 100 % · alertas.service 100 % · auth.service 100 %.

**Performance (curl, dataset del piloto):**
- `GET /api/inmuebles?limit=20`: ~4 ms (warm) / 144 ms (cold)
- `GET /api/inmuebles?limit=1000` (set del mapa): 7–13 ms
- `GET /api/inmuebles/:id` (SHAP + comparables): 4–14 ms
- `GET /api/inmuebles/:id/reporte` (PDF): 218–391 ms
- Todos **< 500 ms** → no se requirieron índices ni caché adicionales.

## Problemas encontrados y soluciones aplicadas

1. **Cadena analítica desactualizada.** El scraper (@Cron) creció el dataset
   (502 → 700 inmuebles con análisis pendiente). 218 inmuebles no tenían
   análisis.
   **Solución:** re-ejecución completa y ordenada del pipeline
   (geoprocesar → entrenar → segmentar → clasificar → financiero →
   calcular_score → calcular_shap).

2. **Test de R² del modelo de valor fallaba** (`test_r2_supera_umbral`): la R²
   del split único caía a 0.49–0.59 y oscilaba entre ejecuciones por el ruido
   de los anuncios (p. ej. `precio_m2` de 515 COP/m² por área en unidad errónea,
   o 2.9 B COP/m²) que el filtro anterior (p1/p99 + 3σ) no contenía.
   **Solución (ADR 004):** filtro de outliers por **regla de Tukey (IQR
   k=1.5)** sobre `precio` y `precio_m2`, y medición de calidad con **R²
   validada por CV (5-fold)**. La R²_cv subió de ~0.51 a **0.64** y su varianza
   entre folds se redujo a la mitad (σ 0.084 → 0.024). Se añadió `r2_cv`/
   `r2_cv_std` al resumen de entrenamiento y un test de regresión del filtro.

3. **Módulos críticos del backend sin tests.** inmuebles, watchlist, reportes,
   optimizar, alertas y auth no tenían cobertura.
   **Solución:** se escribieron 10 specs nuevas (servicios + controladores),
   llevando los módulos críticos por encima del 60 %.

4. **`@react-pdf/renderer` es ESM y ts-jest no transforma `node_modules`,**
   rompiendo las specs que importan `reporte.service`.
   **Solución:** se mockea el renderer en esas specs; la ruta de armado del
   documento (parseo SHAP, ramas de color, helpers) se ejercita igual, y la
   generación real del PDF se valida end-to-end contra el servicio
   (218–391 ms, 5.4 KB).

## Deuda técnica generada

- [ ] **Auto-recálculo de la cadena analítica tras cada scraping** (hoy es
      manual). Encadenar el pipeline como job posterior al @Cron para que el
      análisis no quede desactualizado.
- [ ] Persistir `r2_cv` también en el endpoint `GET /analytics/metricas`
      (hoy solo se expone `r2` del split; `r2_cv` queda en el resumen de
      entrenamiento y en logs).

## Deuda técnica heredada NO resuelta (fuera de alcance de Fase 8)

- [ ] `datos_oficiales/catastro/` vacío → sin avalúo catastral para validar.
- [ ] Cobertura POT/riesgo principalmente en Floridablanca (Bucaramanga, Girón
      y Piedecuesta incompletos).
- [ ] 15+ inmuebles sin `zona_id` por las bounding boxes provisionales de Fase 0.
- [ ] Autenticación de un solo usuario (auto-login admin); mover a login real si
      se habilita multi-tenencia.

## Cambios al plan original

- La validación de valor se hizo contra la **mediana de precio/m² de los
  comparables** (no contra avalúo catastral, inexistente). Es la alternativa que
  el propio checklist contemplaba.
- El umbral de calidad del modelo de valor pasó a medirse con **R² de validación
  cruzada** en vez del split único, por estabilidad ante el dataset creciente
  (ADR 004). El criterio (> 0.60) se mantiene.
- Se documentaron **4 ADR** (las 3 decisiones de arquitectura más importantes +
  la decisión de robustez del modelo tomada en esta fase), por encima del mínimo
  de 3.

## Estado del sistema al final de la fase

```
SERVICE     STATUS                 PORTS
analytics   Up (9h)                0.0.0.0:8000->8000/tcp
backend     Up (9h)                0.0.0.0:3001->3001/tcp
db          Up (9h) (healthy)      0.0.0.0:5432->5432/tcp
frontend    Up (9h)                0.0.0.0:3000->3000/tcp
redis       Up (9h) (healthy)      0.0.0.0:6379->6379/tcp
scrapers    Up (9h)
```

Tests: analytics **34 passed**, backend **35 passed / 12 suites**.

## Próximos pasos

El MVP queda **cerrado y validado**. Las líneas de evolución (fuera del MVP)
están en la sección *Deuda técnica y mejoras futuras* del CLAUDE.md; la más
prioritaria para operación continua es **automatizar el recálculo del pipeline
tras el scraping**, para que los resultados no dependan de una ejecución manual.
