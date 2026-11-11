# Planner

Application de planification personnelle — Electron + React + TypeScript + Vite, avec stockage local dans IndexedDB.

## Prérequis

Node.js 22 ou plus récent et npm. L'installateur Windows se construit sous Windows 10/11.

## Lancer en développement

```bash
npm install
npm run dev
```

Autres commandes utiles :

```bash
npm run typecheck  # vérifie les processus principal et renderer
npm test           # lance les tests Vitest
npm run lint       # vérifie le code
```

## Construire l'installateur Windows

```bash
npm run dist
```

Le fichier `release/Planner-0.1.0-setup.exe` est produit. Il s'agit d'un
installateur NSIS par utilisateur (aucun droit administrateur nécessaire), avec
icône, nom « Planner » et raccourcis Bureau et menu Démarrer.

Pour tester l'application sans passer par l'installateur :

```bash
npm run build:unpack
```

Le dossier `release/win-unpacked/` contient alors l'application complète.

> L'installateur n'est pas signé numériquement : Windows SmartScreen peut
> afficher un avertissement au premier lancement.

## Où sont les données

Les données restent sur l'ordinateur, dans le dossier de données de
l'utilisateur :

```text
%APPDATA%\Planner\
├── IndexedDB\        base Dexie (catégories, tâches, blocs, réglages)
└── sauvegardes\      copies automatiques JSON (les 5 plus récentes)
```

Pour l'ouvrir : appuyez sur `Windows + R`, saisissez `%APPDATA%\Planner`, puis
validez. Le dossier est indépendant du dossier d'installation : fermer,
désinstaller, réinstaller ou mettre à jour Planner ne supprime pas les données.
Seule la suppression manuelle de `%APPDATA%\Planner` les efface.

Le mode développement (`npm run dev`) utilise le même dossier de données que
l'application installée.

## Sauvegarder et restaurer

1. Ouvrez **Réglages** dans Planner.
2. **Exporter la sauvegarde (JSON)** enregistre un fichier complet (par défaut
   dans vos Documents). Conservez-le hors de l'ordinateur si nécessaire.
3. **Importer une sauvegarde…** remplace toutes les données actuelles par le
   contenu du fichier choisi.

La sauvegarde automatique écrit aussi une copie JSON dans
`%APPDATA%\Planner\sauvegardes\` peu après le démarrage et après les
modifications. L'export manuel reste la copie à conserver durablement.

## Structure

- `electron/` : processus principal et preload.
- `src/core/` : logique pure, sans React ni base de données.
- `src/db/` : schéma et repositories.
- `src/state/` : état d'interface.
- `src/platform/` : adaptateur Electron / navigateur.
- `src/ui/` : composants React.
- `src/styles/` : variables de la charte et styles de base.
- `tests/` : tests Vitest.
