# Planner v2

Application de planification personnelle — Electron + React + TypeScript + Vite.

## Installation

```bash
npm install
```

## Commandes

```bash
npm run dev        # lance Electron avec le rechargement à chaud
npm run build      # typecheck puis build de production
npm run typecheck  # vérifie les processus principal et renderer
npm test           # lance les tests Vitest
```

## Structure

- `electron/` : processus principal et preload.
- `src/core/` : logique pure, sans React ni base de données.
- `src/db/` : schéma et repositories.
- `src/state/` : état d'interface.
- `src/platform/` : adaptateur Electron / navigateur.
- `src/ui/` : composants React.
- `src/styles/` : variables de la charte et styles de base.
- `tests/` : tests Vitest.
