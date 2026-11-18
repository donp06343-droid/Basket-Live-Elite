# Basket Live Elite v2.6

Análisis en vivo de partidos, OCR de capturas de casas de apuestas, seguimiento autónomo, Kelly y cash-out.

## Funciones

| Módulo | Qué hace |
|--------|----------|
| **OCR** | Lee equipos, marcador, reloj, período y líneas Over/Under desde capturas |
| **Modelo** | Proyección de totales, P(Over/Under), P(gana), filtros de edge, cash-out |
| **Seguimiento vivo** | Cada 20 s consulta SportScore / API-Sports, actualiza marcador y re-analiza |
| **SportScore** | Scores en vivo gratis (sin API key) |
| **API-Sports** | Opcional con `API_SPORTS_KEY` en el entorno |
| **Asistente** | Tips según situación del partido y acción del modelo |
| **Kelly (ARS)** | Stake sugerido en pesos argentinos, tope 2.5% / ¼ Kelly |
| **Screen share** | OCR continuo de pantalla + auto-modelo |
| **Live share** | Enlace público `/live/:id` para seguir el marcador |

## Instalación

```bash
npm install
npm start
# http://localhost:3000
npm test
```

## Deploy (Render)

1. Blueprint → este repo (`render.yaml`).
2. Environment (opcional): `API_SPORTS_KEY`.
3. Tras deploy: hard refresh del navegador.

## Flujo operativo

1. Subí captura → **Reconocer** → **Aplicar + modelo**.
2. El seguimiento vivo arranca solo (API + re-análisis cada 20 s).
3. Activá notificaciones del navegador para CASH-OUT y cambios de edge.
4. Revisá **Asistente** y **Kelly** antes de operar.

## Attribution

Scores: [Powered by SportScore](https://sportscore.com/).
