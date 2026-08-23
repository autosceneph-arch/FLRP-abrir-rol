# Florida States RP Bot

Bot de Discord para controlar el estado del rol (Activo / Cerrado / FRP-Farming) + sistema de estadísticas y leaderboards.

## Variables de entorno (Railway)

| Variable     | Descripción              |
|--------------|--------------------------|
| `TOKEN`      | Token del bot            |
| `CLIENT_ID`  | Application ID del bot   |
| `GUILD_ID`   | ID del servidor          |

## Comandos

- `/mensaje-permanente` → Coloca el mensaje permanente + botones
- `/config-roles @rol` → Configura qué roles pueden usar los botones
- `/rp-stats [@usuario]`
- `/horas-totales`
- `/rps-abiertos`
- `/rps-finalizados`
- `/dias-activos`
- `/actividad-semanal`
- `/actividad-mensual`
- `/duracion-sesiones [@usuario]`

## Deploy en Railway

1. Sube este repositorio a GitHub
2. En Railway → New Project → Deploy from GitHub
3. Añade las 3 variables de entorno
4. Deploy
