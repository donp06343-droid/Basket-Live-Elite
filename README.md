# Basket Live Elite Cloud

Plataforma de análisis estadístico de baloncesto, sin funciones de apuestas.

## Incluye
- Interfaz adaptable a celular y PC.
- Registro de marcador y box score por equipo.
- Posesiones estimadas: FGA - ORB + TOV + 0.44 × FTA.
- Pace normalizado a 48 minutos.
- ORtg, DRtg y Net Rating.
- eFG%, TS%, FG%, 3P%, FT%, TOV%, ORB%, FTA/FGA y AST/TO.
- Four Factors y comparación de equipos.
- API Express y base SQLite.
- Persistencia preparada para disco de Render.

## Ejecutar localmente
Requiere Node.js 20 o superior:
```bash
npm install
npm start
```
Abre http://localhost:3000

## Publicar en Render
1. En Render elige **New > Blueprint** y conecta este repositorio.
2. Render leerá `render.yaml` y mostrará el servicio y disco persistente.
3. Revisa el costo antes de confirmar: el blueprint usa un servicio Starter y un disco persistente.
4. Tras desplegar, abre la URL `.onrender.com`.
5. Copia el valor generado de `APP_TOKEN` desde Render y pégalo en la pestaña **Servidor**.

## Datos en vivo
El servidor seguirá disponible con tu PC apagada. Esta versión no incluye proveedor de marcadores en vivo: el puente Tampermonkey y el OCR local de Ollama dependían de tu PC. Para automatizar resultados desde la nube se necesita una API deportiva autorizada y configurar su integración.

## Seguridad
- Mantén privado el valor de `APP_TOKEN`.
- No publiques claves ni tokens en GitHub.
- No introduzcas datos personales sensibles.
