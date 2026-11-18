# Basket Live Elite v2.5

Herramienta **educativa** de análisis en vivo (básquet y multi-deporte base), OCR de capturas de casas de apuestas, seguimiento autónomo, Kelly conservador y cash-out.

**No es consejo de apuestas.** Gestioná riesgo y bankroll con responsabilidad.

## Qué incluye

| Pieza | Descripción |
|--------|-------------|
| **OCR** | Multi-pase + diccionario clubes AR + detección marcador/reloj/período/líneas |
| **Modelo** | Proyección bayesiana, Over/Under, P(gana), filtros conservadores, cash-out |
| **Seguimiento vivo** | Cada 20 s: API (SportScore + API-Sports) + share propio + notificaciones |
| **SportScore** | API gratis sin key (attribution requerida) |
| **API-Sports** | Opcional vía `API_SPORTS_KEY` en Render (100 req/día free) |
| **Asistente** | Tips de reglas abiertas (sin IA de pago) |
| **Kelly ARS** | ¼ Kelly, tope 2.5% bankroll, pesos argentinos |
| **Screen share** | OCR periódico de pantalla + auto-modelo |

## Uso local

```bash
npm install
npm start
# http://localhost:3000
npm test
```

## Deploy (Render)

1. New → Blueprint → conectá este repo (`render.yaml`).
2. (Opcional) Environment: `API_SPORTS_KEY` = tu key de api-sports.io.
3. Tras el deploy: hard refresh (`Ctrl+Shift+R`).

## Flujo recomendado

1. Subí captura → **Reconocer** → **Aplicar + modelo**.
2. Se activa el **seguimiento vivo** (SportScore/API + re-análisis cada 20 s).
3. Activá notificaciones del navegador para CASH-OUT / cambio de edge.
4. Revisá **Asistente** y **Kelly**.

## Limitaciones honestas

- OCR de UIs oscuras no es 100% perfecto.
- APIs free no cubren todas las ligas locales AR en vivo.
- SofaScore/Flashscore no se scrapean (CORS); hay links de búsqueda.
- Notificaciones = Web Notifications (no push nativo).
- **Ningún modelo elimina el riesgo de perder.**

## Attribution

Live scores: [Powered by SportScore](https://sportscore.com/).

## Licencia

Proyecto personal educativo. Usá bajo tu propia responsabilidad.
