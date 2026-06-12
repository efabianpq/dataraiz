# Manual de usuario — DataRaíz

DataRaíz es un tablero que ayuda a decidir **dónde invertir** en vivienda y
locales del Área Metropolitana de Bucaramanga. Reúne anuncios de portales,
información territorial (POT, riesgo) y modelos de análisis para mostrarte, de
un vistazo, qué inmuebles representan una oportunidad y por qué.

Acceso: abre **http://localhost:3000** en el navegador. No hay pantalla de
login: la aplicación entra automáticamente como el usuario administrador.

---

## 1. Cómo interpretar el *score*

Cada inmueble tiene un **score de 0 a 100**: cuanto más alto, mejor combinación
de oportunidad, precio, rentabilidad y riesgo. El score combina cinco factores:

| Factor                | Peso | Qué premia                                            |
|-----------------------|------|-------------------------------------------------------|
| Probabilidad de oportunidad | 30 % | Que el modelo lo clasifique como subvalorado    |
| Brecha de precio      | 25 % | Que el precio esté **por debajo** del valor estimado  |
| Yield bruto           | 25 % | Mayor rentabilidad por arriendo (canon/precio)        |
| Riesgo territorial    | 10 % | Menor amenaza (movimiento en masa, etc.)              |
| Posición vs comparables | 10 % | Mejor precio/m² frente a inmuebles similares        |

Como guía rápida, el dashboard traduce el score en una **señal**:

- **Comprar** (score alto) — fuerte candidato; revisa la ficha y valida en campo.
- **Mantener / Vigilar** (score medio) — interesante pero sin ventaja clara.
- **Evitar** (score bajo) — caro o riesgoso frente a sus comparables.

> El score es una **ayuda a la decisión**, no una recomendación financiera ni un
> avalúo. Los valores son estimaciones de modelos sobre datos de anuncios.
> Algunos inmuebles atípicos (lotes/locales muy fuera de rango) aparecen **sin
> score**: no hay comparables suficientes para evaluarlos con confianza.

### ¿Por qué este score? (SHAP)

En la ficha de cada inmueble, el gráfico **"¿Por qué este score?"** muestra las
variables que más empujan el valor estimado hacia arriba (verde) o hacia abajo
(rojo): área, distancia al centro, distancia a proyectos del POT, riesgo, etc.
Es la explicación transparente detrás del número.

---

## 2. Cómo usar los filtros y el mapa

En la pantalla principal (`/`):

1. **Barra lateral de filtros.** Ajusta tipo (apartamento, casa, lote, local),
   zona (municipio/sector), rango de precio, score mínimo y nivel de riesgo
   máximo aceptado. Los resultados se actualizan en el mapa y en la tabla.
2. **Mapa.** Cada punto es un inmueble, coloreado por su score (verde = alto,
   ámbar/terracota = bajo). Haz clic en un punto para ver un resumen y el botón
   **"Ver detalle"**.
3. **Tabla top-20.** Lista los mejores inmuebles según los filtros; puedes
   ordenar por score, precio o yield. Un clic en una fila abre la ficha.
4. **URL compartible.** Los filtros quedan guardados en la dirección del
   navegador: puedes copiar el enlace para volver a la misma vista.

### Ficha del inmueble (`/inmueble/[id]`)

Muestra precio, score y señal, mini-mapa, tarjetas financieras (valor estimado,
brecha, yield, cap rate), riesgo territorial, el gráfico SHAP y los inmuebles
**comparables**. El botón flotante **"Descargar reporte PDF"** genera un informe
imprimible con todo el análisis.

### Optimizar portafolio (NSGA-II)

El botón **"Optimizar"** abre un asistente: indicas presupuesto, zonas, tipos y
tolerancia al riesgo, y el sistema calcula un **frente de Pareto** — el conjunto
de inmuebles que ofrecen el mejor equilibrio entre rentabilidad, precio y riesgo
(no hay uno que domine a otro en todo). Útil para armar una lista corta cuando
hay varios objetivos en tensión.

---

## 3. Cómo guardar una búsqueda (watchlist) y ver alertas

En la página **Watchlist** (`/watchlist`):

- **Guardar una búsqueda.** Define un conjunto de criterios (por ejemplo "aptos
  en Floridablanca, score > 70, hasta $400 M") y guárdalo con un nombre. Más
  tarde puedes **aplicarlo al mapa** con un clic o **eliminarlo**.
- **Alertas.** Cuando aparecen inmuebles de alta oportunidad
  (probabilidad alta de estar subvalorados), el sistema genera alertas. La
  página lista las **no vistas**; al revisarlas puedes marcarlas como vistas
  para que dejen de aparecer.

---

## Glosario rápido

- **Valor estimado:** precio que el modelo predice para el inmueble.
- **Brecha:** diferencia % entre el precio del anuncio y el valor estimado.
  Negativa = posible ganga (más barato que su valor).
- **Yield bruto:** rentabilidad anual por arriendo (canon estimado / precio).
- **Cap rate:** rentabilidad neta aproximada del inmueble.
- **Comparable:** inmueble similar (mismo tipo/zona/segmento) usado de
  referencia de precio.
- **Riesgo territorial:** nivel de amenaza (p. ej. movimiento en masa) según las
  capas oficiales del POT en la ubicación del inmueble.
