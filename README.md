# Basket Live Elite

Plataforma de seguimiento, estadísticas avanzadas y análisis de baloncesto con gestión de bankroll (Criterio de Kelly).

> Herramienta **educativa**. No es consejo financiero ni de apuestas. Apostá con responsabilidad.

## Funciones principales

### Marcador y métricas
- Diseño adaptable a PC y celular.
- Marcador manual: equipos, competición (FIBA / NBA / custom), período y reloj.
- Box score completo: FGA, FGM, triples, libres, rebotes, pérdidas, asistencias, robos y tapones.
- Métricas: posesiones, Pace, ORtg, DRtg, Net Rating, eFG%, TS%, FG%, 3P%, FT%, TOV%, ORB%, FTA/FGA, AST/TO y Four Factors.

### OCR de capturas (mejorado)
- Subí una captura del marcador.
- Pre-procesado de contraste + Tesseract.js (español + inglés) 100 % en el navegador.
- Detección de marcador, reloj, período y nombres de equipo.
- **Siempre revisá** el resultado antes de aplicar.

### Seguimiento continuo por video / pantalla
- Compartí una ventana, pestaña o pantalla donde se vea un scoreboard público.
- El sistema captura frames periódicamente, corre OCR y actualiza el marcador.
- Si tenés un enlace live activo, también empuja las actualizaciones al visor compartido.
- Nada de la imagen se sube al servidor.

### Análisis profesional en vivo
- Genera un informe estructurado (estilo analista) con:
  - Estado del marcador y control del partido
  - Eficiencia (ORtg / DRtg / Net / Four Factors)
  - Ritmo (Pace)
  - Lectura de cuotas y edge (si cargás cuotas + tu probabilidad modelo)
  - Contexto emocional / situacional
  - Recomendación operativa: **ENTRAR / HOLD / NO ENTRAR / CONSIDERAR CASH-OUT**
- Notificaciones del navegador cuando cambia la recomendación.

### Criterio de Kelly y bankroll
- Cálculo de Kelly completo y fraccionado (¼, ½, ¾).
- Stake sugerido, edge y valor esperado.
- Registro manual de posiciones abiertas (ganadas / perdidas / cash-out).
- Bankroll persistente en el navegador.

### Compartir y historial
- Enlaces públicos de solo lectura (actualización cada 5 s).
- Clave privada de edición por partido (solo el navegador creador puede modificar).
- Historial en SQLite en el servidor.

## Modelo probabilístico (v2.1)

Archivo `public/model.js`, sin dependencias y con tests (`npm test`).

- **Proyección del total** con mezcla bayesiana: el ritmo real pesa más cuantos más minutos se juegan; el resto lo aporta la línea de mercado.
- **P(Over/Under)** con distribución normal y manejo de push; **P(ganador)** a partir del marcador, el tiempo y la fuerza pre-partido.
- **EV y Kelly**: se quita el margen de la casa, la probabilidad se mezcla 65 % modelo / 35 % mercado, mínimo EV 4 %, ventaja mínima 3 pp, mínimo 6 minutos jugados y stake con tope del 4 % del bankroll.
- **Cambios de ritmo**: compara los puntos/min de los últimos 3 minutos o más con el ritmo anterior (z-score) y avisa una vez por tramo.
- Sin cuotas pre-partido no se evalúa valor en el ganador, para no inventar ventajas.

Ningún modelo garantiza beneficio: estima probabilidades, no resultados.

## Ejecutar localmente

Requiere **Node.js 22**:

```bash
npm install
npm start
```

Abrí http://localhost:3000

## Publicar en Render

El archivo `render.yaml` configura un servicio gratuito. Conectá el repositorio en Render con **New > Blueprint**.

En el plan gratuito el disco puede ser temporal: el historial SQLite puede perderse tras reinicios. Para datos fiables hace falta almacenamiento persistente.

## Límites importantes

- El seguimiento por pantalla/OCR depende de la calidad del scoreboard y de la fuente. No es 100 % preciso; siempre validá.
- No obtiene automáticamente el marcador desde APIs de ligas ni streams de pago.
- Las recomendaciones de “entrar / no entrar / cash-out” son **heurísticas educativas** basadas en el flujo del partido y, si las cargás, en tu probabilidad modelo vs cuota. No garantizan resultados.
- Cumplí las leyes de tu jurisdicción sobre apuestas.

## Seguridad

- El enlace público solo permite consultar.
- La clave de edición queda en el navegador que creó el partido.
- Si configurás `APP_TOKEN` en el entorno, las escrituras también lo exigen.
- No subas tokens ni datos personales a GitHub.
