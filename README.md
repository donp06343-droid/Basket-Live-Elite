# Basket Live Elite v2.2

Plataforma de seguimiento, estadísticas avanzadas y análisis de baloncesto con gestión de bankroll (Criterio de Kelly **conservador**).

> Herramienta **educativa**. No es consejo financiero ni de apuestas. Apostá con responsabilidad y cumplí la ley de tu jurisdicción.

## Qué incluye

### Marcador y métricas
- Diseño adaptable PC / celular
- Box score completo + Pace, ORtg, DRtg, Net, eFG%, TS%, Four Factors

### OCR para casas de apuestas
- Capturas tipo Bet365 / apps AR: detecta equipos, marcador (`38 : 30`), *time elapsed*, período, líneas Over/Under
- Al aplicar → corre el modelo automáticamente

### Screen share
- Compartí pestaña/ventana del scoreboard
- OCR periódico + actualización de marcador + modelo

### Modelo probabilístico v2.2 (conservador)
- Proyección bayesiana del total
- P(Over/Under) y P(ganador) con mezcla modelo/mercado
- Filtros estrictos: ≥8 min jugados, EV ≥5%, edge ≥3.5 pp, cuota ≥1.25
- Stake máximo **2.5%** del bankroll · máximo **¼ Kelly**
- Acciones: **ENTRAR / HOLD / NO ENTRAR / CASH-OUT**
- Cash-out cuando el edge se cae o el marcador se da vuelta
- Alertas de ritmo (acelera/frena)

### Seguimiento vivo + notificaciones
- Botón **Seguir vivo + avisos**
- Re-análisis cada 20 s
- Notificaciones del navegador al cambiar la acción (sobre todo CASH-OUT)

### Live links
- Enlace público de solo lectura
- Clave de edición local por partido

## Correr local

```bash
npm install
npm start
# http://localhost:3000
npm test
```

Requiere **Node.js 22**.

## Deploy en Render

Conectá el repo con **New → Blueprint** (`render.yaml`).

En plan free el disco puede ser temporal.

## Filosofía de riesgo

- Menos stake, más reflexión
- No forzar entradas con poco sample
- Preferir **HOLD / NO ENTRAR / CASH-OUT** cuando el edge no es claro
- El objetivo es **proteger bankroll**, no maximizar apuestas

## Seguridad

- El enlace público solo consulta
- La clave de edición queda en el navegador creador
- `APP_TOKEN` opcional en el entorno para escrituras
