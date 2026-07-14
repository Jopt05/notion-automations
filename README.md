# 🔥 Notion Habit Streak Automation

Automatización que calcula las rachas (streaks) de tu Habit Tracker en Notion, estilo Duolingo.

## ¿Qué hace?

- Consulta todos los registros de tu base de datos "Habit Tracker"
- Calcula los días consecutivos con `Done = ✅` por cada hábito
- Actualiza la propiedad `Streak 🔥` en los registros del día actual
- Crea/actualiza una página "🔥 Rachas" con un dashboard resumen

## Requisitos

- Node.js 20+
- Una integración de Notion con acceso a tu base de datos
- Un repositorio en GitHub (para el cron automático)

## Setup

### 1. Configurar Notion

1. Ve a [notion.so/my-integrations](https://www.notion.so/my-integrations) y crea una integración
2. Copia el token (empieza con `ntn_`)
3. Conecta la integración a tu base de datos: página → `...` → Connections → tu integración
4. Agrega una propiedad tipo **Number** llamada `Streak 🔥` a tu Habit Tracker

### 2. Configurar GitHub

1. Sube este repo a GitHub
2. Ve a Settings → Secrets and variables → Actions
3. Crea un secret: `NOTION_TOKEN` = tu token de Notion

### 3. Ejecutar manualmente

```bash
npm install
NOTION_TOKEN=tu_token node update-streaks.js
```

O desde GitHub Actions: Actions → "Update Habit Streaks" → Run workflow

## Cron

El workflow se ejecuta automáticamente todos los días a las **12:00 PM (hora CDMX)**.

Puedes modificar el horario en `.github/workflows/update-streaks.yml` ajustando el cron (usa hora UTC).

## Estructura

```
notion-automation/
├── .github/workflows/update-streaks.yml  # GitHub Action (cron diario)
├── update-streaks.js                     # Script principal
├── package.json                          # Dependencias
├── .gitignore
└── README.md
```

## Lógica de rachas

- Se evalúa desde el registro más reciente hacia atrás
- Si el día más reciente tiene `Done = false`, la racha es 0
- Si hay un día sin registro entre dos días con `Done = true`, la racha se rompe
- La racha se actualiza solo en los registros del día actual
