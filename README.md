# Basket Live Elite

Plataforma de seguimiento y análisis estadístico de baloncesto. No incluye funciones de apuestas.

## Funciones
- Diseño adaptable a PC y celular.
- Marcador manual con equipos, competición, período y reloj (FIBA, NBA o duración personalizada).
- Captura de pantalla con OCR en el navegador para intentar reconocer nombres, puntos, período y reloj. La lectura debe revisarse antes de aplicarla.
- La imagen se procesa en el navegador con Tesseract.js y no se carga a la API de este proyecto.
- Box score para ambos equipos: FGA, FGM, triples, libres, rebotes, pérdidas, asistencias, robos y tapones.
- Métricas: posesiones estimadas, Pace, ORtg, DRtg, Net Rating, eFG%, TS%, FG%, 3P%, FT%, TOV%, ORB%, FTA/FGA, AST/TO y Four Factors.
- Historial de partidos en SQLite.
- Enlaces públicos de solo lectura para seguir un marcador desde otro teléfono o PC; la vista se actualiza cada cinco segundos.
- Clave privada por partido para que solo el navegador que lo creó pueda modificarlo o finalizarlo.

## Ejecutar localmente
Requiere Node.js 22:
```bash
npm install
npm start
```
Abrí http://localhost:3000

## Publicar en Render
El archivo `render.yaml` configura un servicio gratuito. Conectá el repositorio en Render mediante **New > Blueprint** y seguí los pasos de publicación. La URL pública se muestra en el panel del servicio.

## Importante sobre el plan gratuito
El servicio gratuito puede entrar en reposo y el sistema de archivos local puede ser temporal. Por eso, el historial SQLite y los partidos guardados pueden perderse después de reinicios o nuevos despliegues. Para conservar datos de forma fiable hace falta almacenamiento persistente, que no está incluido en el servicio gratuito.

## Límites del seguimiento
El enlace compartido muestra los datos que carga la persona que creó el partido; no obtiene automáticamente el marcador desde una transmisión. Los marcadores automáticos requieren integrar un proveedor deportivo autorizado y compatible. El OCR puede confundir caracteres y números según la calidad y el diseño de la captura.

## Seguridad y privacidad
- El enlace público permite consultar el marcador y las estadísticas de ese partido.
- La clave privada de edición se guarda en el navegador que creó el partido.
- Si configurás `APP_TOKEN` en el entorno del servidor, las operaciones de escritura también requieren ese token.
- No subas tokens, contraseñas ni datos personales a GitHub.
