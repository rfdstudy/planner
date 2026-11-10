# Planner v2 – Architecture et modèle de données

*Document 2 sur 4. Il complète le cahier des charges et doit être fourni à l'agent de code avec lui.*

## 1. Choix techniques

| Besoin | Choix | Pourquoi |
| --- | --- | --- |
| Application PC | **Electron** + electron-vite | `.exe` Windows, même code que le web |
| Interface | **React 18 + TypeScript + Vite** | écosystème large, bien connu des agents de code |
| Données | **IndexedDB** via **Dexie** (`useLiveQuery`) | local, rapide, l'écran se met à jour tout seul |
| État d'interface | **Zustand** | léger : semaine affichée, panneaux, état du glisser |
| Glisser-déposer | **événements pointeur maison** (ou dnd-kit) | contrôle total de la fluidité |
| Dates | **date-fns** | simple, sans fuseau horaire caché |
| Récurrence | **rrule** | format standard, compatible ICS |
| Style | **CSS Modules + variables CSS** | charte visuelle centralisée (document 3) |
| Installateur | **electron-builder** (NSIS) | génère le `.exe` |
| Tests | **Vitest** | uniquement sur la logique pure |

## 2. Structure du projet

```
planner/
├── electron/            fenêtre, menu, sauvegarde fichier (IPC)
│   ├── main.ts
│   └── preload.ts
├── src/
│   ├── core/            LOGIQUE PURE (aucun React, aucune base)
│   │   ├── types.ts         modèle de données
│   │   ├── time.ts          minutes, pas de 15 min, formats
│   │   ├── recurrence.ts    occurrences virtuelles depuis les modèles
│   │   └── schedule.ts      chevauchements, créneaux libres
│   ├── db/              ACCÈS AUX DONNÉES
│   │   ├── database.ts      schéma Dexie et migrations
│   │   ├── repositories/    categories, items, templates, settings
│   │   └── backup.ts        export / import JSON, export ICS
│   ├── state/           état d'interface (Zustand)
│   ├── platform/        adaptateur Electron / navigateur
│   ├── ui/              composants (WeekView, DayView, TimeGrid, Block,
│   │                    InboxPanel, CategoriesScreen, CommandPalette…)
│   ├── styles/          tokens.css, base.css
│   └── main.tsx
├── tests/
└── docs/
```

**Règle de dépendance :** `core` ne connaît rien d'autre ; `db` utilise `core` ; `ui` utilise `db` et `core`. Jamais l'inverse. C'est ce qui évite les collisions de la v1.

**Règle d'écriture :** toutes les modifications de données passent par les **repositories**. Aucun composant n'écrit directement dans la base. C'est aussi ce qui rendra la synchro possible plus tard.

## 3. Modèle de données

Chaque enregistrement possède : `id` (uuid), `createdAt`, `updatedAt`, `deletedAt` (vide tant que l'élément existe).

### Temps : pas de fuseau horaire

Un horaire est stocké en **date locale + minutes depuis minuit** : `date: '2026-11-12'`, `startMin: 840` (= 14 h 00), `durationMin: 90`. Cela évite les bugs de fuseau et de changement d'heure, inutiles pour un usage personnel.

### Tables

**CategoryGroup** : `name`, `order`. Au premier lancement : « Matières » et « Projets ». Renommables, supprimables, extensibles.

**Category** : `name`, `color`, `groupId`, `order`, `archivedAt`. Aucune catégorie n'est écrite dans le code ; l'écran de démarrage propose des catégories à cocher ou à saisir.

**Item** (l'élément central) :

| Champ | Description |
| --- | --- |
| `kind` | `fixed` · `task` · `exam` · `free` |
| `title`, `notes` | texte |
| `categoryId` | optionnel (sans catégorie = neutre) |
| `estimateMin` | durée totale estimée de la tâche, à répartir en un ou plusieurs blocs |
| `status` | `todo` ou `done` (tâches) ; une tâche terminée reste affichée sur la grille, grisée |
| `templateId` | si l'élément vient d'un modèle de semaine type |

**Block** (créneau dans le temps) : `itemId`, `date`, `startMin`, `durationMin`. C'est le bloc, et non l'élément, qui est placé sur la grille. Conséquences :

- Une tâche peut avoir **plusieurs blocs**, le même jour ou sur plusieurs jours (par exemple 2 × 45 min).
- Une tâche **sans aucun bloc** est « à planifier ». Supprimer son dernier bloc la remet dans cette liste.
- Une épreuve a un bloc dont `startMin` peut rester vide : elle s'affiche alors sur la ligne du haut du jour.
- L'app compare `estimateMin` à la somme des blocs et peut afficher le temps qu'il reste à planifier.
- Déplacer ou redimensionner un bloc ne modifie jamais la tâche elle-même.

**Template** (semaine type) : `kind` (`fixed` ou `free`), `title`, `categoryId`, `rrule` (par exemple chaque lundi et mercredi), `startMin`, `durationMin`, `validFrom`, `validUntil`.

**Override** (exception d'un modèle) : `templateId`, `date`, `action` (`skip` pour supprimer ce jour-là, ou `modify` avec les champs modifiés).

**Setting** (clé / valeur) : thème, premier jour de la semaine, pas de glisser (15 min), durées par défaut par type, heure de défilement initial.

### Pourquoi des occurrences virtuelles

La v1 générait les événements récurrents à l'avance sur 90 jours. En v2, **les blocs de la semaine type ne sont pas stockés jour par jour** : `core/recurrence.ts` les calcule à l'affichage à partir des modèles et des exceptions. Conséquences :

- Modifier un modèle met à jour toutes les semaines, passées ou futures, immédiatement.
- « Modifier cette semaine seulement » crée simplement un `Override`.
- Aucune dérive, aucun doublon, aucune limite de 90 jours.

Si l'utilisateur déplace un bloc de semaine type par glisser-déposer, l'app demande : **cette fois seulement** (Override) ou **toutes les semaines** (modifie le modèle).

## 4. Règles de fonctionnement

- **Chevauchements :** blocs placés côte à côte, algorithme dans `core/schedule.ts`.
- **Créneaux libres :** intervalles non occupés de la journée, calculés à la demande et affichés **uniquement pendant un glisser**. Tous les types de blocs comptent comme occupés.
- **Plage affichée :** 00 h → 23 h. L'échelle est fixe (1 minute = 1 pixel de base, zoom possible). Au chargement, la vue défile vers l'heure actuelle, ou vers 7 h en dehors d'aujourd'hui.
- **Suppression d'une catégorie :** opération unique : l'app demande une catégorie de remplacement ou « sans catégorie », puis met à jour tous les éléments concernés et supprime la catégorie. Aucun élément n'est perdu.
- **Annulation :** pile d'actions inverses en mémoire (50 niveaux), alimentée par les repositories.
- **Suppression :** logique (`deletedAt`), purge définitive plus tard.

## 5. Fluidité du glisser-déposer

1. Pendant le geste, **seul le bloc déplacé bouge** (transformation CSS) ; la grille ne se redessine pas.
2. La position est calculée à partir du pointeur, avec accrochage sur 15 minutes.
3. L'écriture en base n'a lieu **qu'au lâcher**.
4. Les blocs sont des composants mémorisés ; la requête de données ne charge que la semaine affichée (index sur `date`).
5. Aucun effet visuel coûteux (ombres floues, animations longues) pendant le déplacement.

## 6. Sauvegarde et robustesse

- **Migrations** : le schéma Dexie est versionné ; une mise à jour de l'app ne perd jamais les données.
- **Export / import JSON** manuel, avec numéro de version du schéma.
- **Sauvegarde automatique** : l'app écrit régulièrement un fichier JSON dans le dossier de l'application via Electron, au cas où IndexedDB serait vidé.
- **Export ICS** du calendrier.

## 7. Electron

- `contextIsolation` activé, `nodeIntegration` désactivé.
- Le processus principal reste minimal : fenêtre, menu, écriture et lecture des sauvegardes, instance unique.
- L'interface n'accède à Electron que par `platform/` (une interface avec deux implémentations : Electron et navigateur).

## 8. Préparation de la version téléphone

Rien à construire maintenant, mais la structure l'autorise :

- Le même code web sera publiable sur GitHub Pages (chemin de base configurable dans Vite).
- Un mode **lecture seule, journée en cours** sera une vue supplémentaire, sans toucher au `core`.
- La synchro viendra se brancher sur les repositories, grâce aux champs `updatedAt` et `deletedAt`.

## 9. Questions encore ouvertes

- Une tâche longue peut-elle être **découpée en plusieurs blocs** (par exemple 2 × 45 min), ou un bloc = une tâche ? Oui, les tâches longues peuvent être découpé en plusieurs blocs, même pouvant être étalé sur plusieurs jours.&#32;
- Une tâche cochée **disparaît-elle** de la grille ou reste-t-elle **grisée** ? Non, elle ne disparaît pas, elle reste grisée.&#32;
