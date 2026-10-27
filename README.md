# Florida States RP Bot

Bot de Discord para controlar el estado del rol (Activo / Cerrado / FRP-Farming) + sistema de estadísticas y leaderboards.

**v2.2.0**

## Variables de entorno (Railway)

| Variable     | Descripción              |
|--------------|--------------------------|
| `TOKEN`      | Token del bot            |
| `CLIENT_ID`  | Application ID del bot   |
| `GUILD_ID`   | ID del servidor          |

## Comandos principales

- `/mensaje-permanente` → Coloca el mensaje permanente + botones
- `/config-roles` → Configura roles + **usuario DM** (nuevo)
- `/agregar-tiempo` → Suma minutos a un usuario
- `/quitar-tiempo` → **Quita minutos** a un usuario (nuevo)
- `/rp-stats [@usuario]`
- `/horas-totales`
- `/rps-abiertos`
- `/rps-finalizados`
- `/dias-activos`
- `/actividad-semanal`
- `/actividad-mensual`
- `/duracion-sesiones [@usuario]`

### /config-roles (actualizado)
- `rol` → Rol general (botones + comandos)
- `rol-permanente` → Rol para mensaje permanente y modificar stats
- `rol-mencion` → Rol mencionado en apertura/cierre
- `dm` → **Usuario que recibe el TOP diario por DM** (copia de seguridad de horas)

## DM Diario del TOP
Si configuras un usuario en `/config-roles` con la opción `dm`, el bot le manda automáticamente todos los días un mensaje privado con el ranking de **horas totales** (top 15).  
Sirve de backup por si Railway se reinicia y se pierden los datos.

## Deploy en Railway

1. Sube este repositorio a GitHub
2. En Railway → New Project → Deploy from GitHub
3. Añade las 3 variables de entorno
4. Deploy
