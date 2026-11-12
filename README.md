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

Le fichier `release/Planner-Setup.exe` est produit. Il s'agit d'un installateur
NSIS par utilisateur (aucun droit administrateur nécessaire), avec
icône, nom « Planner » et raccourcis Bureau et menu Démarrer.

Pour tester l'application sans passer par l'installateur :

```bash
npm run build:unpack
```

Le dossier `release/win-unpacked/` contient alors l'application complète.

> L'installateur n'est pas signé numériquement : Windows SmartScreen peut
> afficher un avertissement au premier lancement.

## Mettre à jour l'application

### Installer la nouvelle version

1. Avant la mise à jour, ouvrez **Réglages** dans Planner et cliquez sur
   **Exporter la sauvegarde (JSON)**. Conservez ce fichier : il permet de
   restaurer toutes les données en cas de problème.
2. Fermez complètement Planner (toutes ses fenêtres).
3. Lancez la commande :

```bash
npm run release
```

4. Puis lancez `release/Planner-Setup.exe`.
5. Installez-le par-dessus la version existante : il n'est pas nécessaire de
   désinstaller l'ancienne version.
6. Relancez Planner. Les données restent dans `%APPDATA%\Planner` et sont
   conservées.

L'installateur s'appelle toujours `Planner-Setup.exe` : son nom ne contient pas
de numéro de version.

### Revenir à la version précédente

Lors de la préparation d'une nouvelle version, l'installateur précédent est
conservé dans `release/precedent/Planner-Setup.exe`. Il est remplacé à chaque
nouvelle version, qui permet donc de revenir à la version immédiatement
précédente.

1. Exportez vos données en JSON depuis **Réglages**.
2. Fermez complètement Planner.
3. Lancez `release/precedent/Planner-Setup.exe`.
4. Installez-le par-dessus la version actuelle, puis relancez Planner.
5. Si nécessaire, importez la sauvegarde JSON depuis **Réglages**.

> Une désinstallation, une réinstallation ou une mise à jour ne supprime pas
> les données. L'export JSON reste la sauvegarde à conserver durablement.

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

## Version téléphone (lecture seule)

L’application iPhone ne contient ni la base de données ni l’éditeur. Le PC
produit un **instantané** en lecture seule ; l’iPhone l’importe et l’affiche.
Aucune modification du calendrier n’est possible depuis le téléphone.

### Générer l’instantané sur le PC

1. Dans Planner, ouvrez le menu **Exporter pour le téléphone**, ou `Ctrl+K`
   puis **Exporter pour le téléphone**.
2. Choisissez le dossier d’enregistrement. La boîte propose le fichier
   `planner-telephone.json` et rouvre le dernier dossier utilisé.
3. Transférez ce fichier sur l’iPhone (AirDrop, iCloud Drive, dossier
   **Fichiers**…).

L’instantané couvre la veille, le jour de l’export et les 21 jours suivants.
Les cours de la semaine type, leurs exceptions et les éléments multi-jours sont
déjà développés dans le fichier. Il ne contient aucun identifiant interne et
aucune tâche encore à planifier.

### Installer l’application sur l’iPhone

1. Ouvrez **Safari** à l’adresse
   `https://rfdstudy.github.io/planner/` (adaptez le nom du dépôt si besoin).
2. Touchez le bouton **Partager**.
3. Choisissez **Sur l’écran d’accueil**, puis **Ajouter**.

L’application s’ouvre ensuite en plein écran, comme une application normale.
Elle reste utilisable hors ligne après la première visite.

### Mettre à jour les données

1. Générez un nouvel instantané sur le PC.
2. Ouvrez l’application Planner sur l’iPhone, puis touchez **Mettre à jour**.
3. Dans l’application **Fichiers**, choisissez `planner-telephone.json`.

Les données sont remplacées et la ligne sous la date indique la fraîcheur de
l’instantané, par exemple « Données du 12 nov. à 20:15 ». Un bandeau signale un
instantané de plus de 24 heures et un message explique lorsqu’un jour sort de
la fenêtre exportée.

### Mettre à jour l’application elle-même

À chaque push sur `main`, le workflow GitHub Actions reconstruit `dist-phone/`
et le publie. Rouvrez ensuite l’application sur l’iPhone en étant connecté :
le service worker remplace l’ancienne version au plus tard à la réouverture.

En développement :

```bash
npm run dev:phone      # aperçu local, par exemple sur http://localhost:5173/phone.html
npm run build:phone    # produit dist-phone/
npm run preview:phone  # sert le build (service worker et mode hors ligne)
```

### Activer GitHub Pages une seule fois

1. Dans le dépôt GitHub, ouvrez **Settings** puis **Pages**.
2. Dans **Build and deployment**, choisissez la source **GitHub Actions**.
3. Poussez sur `main` (ou lancez le workflow manuellement). Le site est ensuite
   publié à l’adresse indiquée par l’environnement `github-pages`.

Le build utilise la variable `PHONE_BASE` (chemin du dépôt Pages). Le workflow
la renseigne automatiquement avec `/<nom-du-depot>/`.

> `planner-telephone.json` et `dist-phone/` sont ignorés par Git : aucune
> donnée personnelle ne doit être ajoutée au dépôt ni au site publié.

## Structure

- `electron/` : processus principal et preload.
- `src/core/` : logique pure, sans React ni base de données.
- `src/db/` : schéma et repositories.
- `src/state/` : état d'interface.
- `src/platform/` : adaptateur Electron / navigateur.
- `src/ui/` : composants React.
- `src/phone/` : application iPhone en lecture seule (sans Dexie ni éditeur).
- `src/styles/` : variables de la charte et styles de base.
- `public-phone/` : manifeste, service worker et icônes de la PWA.
- `vite.phone.config.mts` : build séparé vers `dist-phone/`.
- `tests/` : tests Vitest.
