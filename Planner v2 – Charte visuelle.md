# Planner v2 – Charte visuelle

*Document 3 sur 4. À fournir à l'agent de code avec les documents 1 et 2. Toutes les valeurs ci-dessous sont des propositions à valider.*

## 1. Intention

L'application doit ressembler à une **feuille de papier bien rangée** : claire, calme, avec très peu d'éléments qui attirent l'œil. Les seules touches de couleur viennent des **catégories** (et d'un rouge discret pour les épreuves), jamais de l'interface elle-même.

## 2. Règles d'or contre la surcharge

1. **Un bloc = un titre + une heure.** Rien d'autre à l'écran ; le reste s'ouvre au clic.
2. **Une seule couleur par bloc**, celle de sa catégorie. Le texte reste toujours gris foncé.
3. **Pas de bordures autour des panneaux** : on sépare par un fond légèrement différent et par de l'espace.
4. **Pas d'emoji, pas d'étoiles, pas de pastilles multiples** dans l'interface.
5. **Trois niveaux de texte seulement** : principal, secondaire, discret.
6. **L'espace blanc est volontaire** : on ne le remplit pas.

## 3. Couleurs

### Interface (thème clair)

```css
:root {
  /* Surfaces */
  --bg: #FFFFFF;            /* grille, fenêtres */
  --bg-subtle: #F7F7F5;     /* panneaux, fond de l'app */
  --bg-hover: #F1F1EE;

  /* Lignes */
  --line: #ECECE8;          /* lignes d'heures, séparateurs */
  --line-strong: #DDDDD7;

  /* Texte */
  --text: #1F2328;          /* principal */
  --text-2: #4B525B;        /* secondaire */
  --text-3: #70757E;        /* discret : heures, métadonnées */

  /* Accent unique (graphite) */
  --accent: #1F2328;
  --accent-soft: rgba(31, 35, 40, 0.06);

  /* Alerte : réservée aux épreuves */
  --alert: #D6455D;
  --alert-soft: #FDECEF;

  /* Typographie */
  --font: 'Inter', system-ui, sans-serif;
  --fs-xs: 12px; --fs-sm: 13px; --fs-md: 14px; --fs-lg: 16px; --fs-xl: 20px;

  /* Espacement (base 4 px) */
  --sp-1: 4px; --sp-2: 8px; --sp-3: 12px; --sp-4: 16px; --sp-6: 24px; --sp-8: 32px;

  /* Formes */
  --radius-block: 6px; --radius-panel: 10px; --radius-ctl: 8px;

  /* Ombre : menus et bloc déplacé uniquement */
  --shadow-float: 0 6px 20px rgba(31, 35, 40, 0.12);

  /* Mouvement */
  --t-fast: 120ms ease-out; --t-panel: 180ms ease-out;
}
```

L'accent est un **graphite** (presque noir) et non une couleur vive : ainsi la couleur ne désigne jamais que des matières ou des projets. Il sert aux boutons principaux, au jour courant, à la ligne de l'heure actuelle et au contour de sélection.

### Catégories (palette proposée)

L'utilisateur choisit parmi ces dix teintes dans l'écran des catégories, avec la possibilité d'une couleur libre.

| Nom | Valeur | Nom | Valeur |
| --- | --- | --- | --- |
| Rouge | `#E5484D` | Turquoise | `#12A594` |
| Orange | `#F2730D` | Bleu | `#3E63DD` |
| Ambre | `#D9A400` | Indigo | `#6E56CF` |
| Vert | `#30A46C` | Violet | `#AB4ABA` |
| Rose | `#D6409F` | Gris | `#8B8D98` |

Usage d'une catégorie sur un bloc : une **barre latérale de 3 px** dans la couleur pleine, et un **fond très léger** (`color-mix(in srgb, var(--cat) 10%, white)`). Le texte ne prend jamais la couleur de la catégorie.

## 4. Typographie

- Police unique : **Inter**, embarquée dans l'application (paquet `@fontsource/inter`) pour fonctionner hors ligne.
- Chiffres alignés pour les heures : `font-variant-numeric: tabular-nums`.
- Tailles : 12 px (heures, métadonnées) · 13 px (texte des blocs) · 14 px (texte courant) · 16 px (titres de panneau) · 20 px (libellé de la semaine).
- Graisses : 400 (courant), 500 (titres de blocs), 600 (titres de panneau et libellé de semaine). Pas d'italique, pas de majuscules forcées.

## 5. Anatomie des blocs

Échelle de base : **1 minute = 1 pixel** (un bloc de 60 min mesure 60 px), avec zoom possible.

| Type | Fond | Bord | Texte | Particularité |
| --- | --- | --- | --- | --- |
| **Fixe** | `--bg-subtle` | aucun | `--text-2` | gris neutre, ne ressort pas |
| **Tâche** | teinte 10 % de la catégorie | barre latérale 3 px | `--text` | point de couleur dans l'éditeur |
| **Épreuve** | `--alert-soft` | barre latérale 3 px `--alert` | `--text` | petit marqueur + « J-3 » |
| **Libre** | transparent | pointillé `--line-strong` | `--text-3` | discret, laisse voir la grille |

**Contenu selon la hauteur du bloc :**

- moins de 30 min : titre seul sur une ligne, heure masquée ;
- de 30 à 59 min : titre et heure de début sur la même ligne ;
- 60 min et plus : titre sur la première ligne, plage horaire en dessous (`--text-3`) ;
- au-delà de 90 min : le nom de la catégorie apparaît en petit en bas du bloc.

Titres trop longs : une ligne, coupés par « … » (jamais de retour à la ligne forcé sous 60 min).

## 6. Vue Semaine

- **Barre du haut** (48 px) : flèches précédent / suivant, libellé de la semaine (20 px, 600), bouton « Aujourd'hui », bascule Jour / Semaine, accès à la palette (`Ctrl+K`). Pas de menu burger, pas de logo.
- **En-tête de colonne** : initiale du jour en `--text-3`, numéro du jour en 16 px. Le jour courant a son numéro dans un **cercle graphite** à texte blanc.
- **Ligne des épreuves** : une bande sous l'en-tête de chaque jour, hauteur variable, avec des pastilles `--alert-soft` du type « DS Maths · J-3 ». Vide = aucun espace perdu.
- **Grille** : lignes d'heures en `--line`, pas de ligne de demi-heure, colonne des heures de 48 px en `--text-3`. La ligne de l'heure actuelle est graphite, 1,5 px, avec un point à gauche.
- **Panneau « À planifier »** : à droite, 280 px, fond `--bg-subtle`, sans bordure, repliable.
- **Colonnes** : séparées uniquement par un filet `--line` très léger.

## 7. Panneau « À planifier »

- Rangées de 36 px : point de catégorie, titre, durée restante en `--text-3` (« 45 min »).
- Filtres : de petites pastilles de catégories en haut, une seule ligne, défilement horizontal.
- Champ d'ajout rapide **toujours visible en haut** : placeholder « Ajouter une tâche… ».
- Au survol d'une rangée : fond `--bg-hover` et poignée de glissement discrète à gauche.

## 8. États et interactions

| État | Rendu |
| --- | --- |
| Survol d'un bloc | fond légèrement assombri, curseur « main », aucune animation de taille |
| Sélection | contour 2 px `--accent` |
| Tâche terminée | opacité 50 %, désaturée, texte non barré |
| Glisser (bloc déplacé) | ombre `--shadow-float`, opacité 95 % |
| Glisser (aperçu) | emplacement fantôme avec l'heure d'arrivée en `--text-2` |
| Créneaux libres (pendant le glisser seulement) | fond `--accent-soft` avec bordure pointillée |
| Poignée de redimensionnement | apparaît au survol du bord inférieur uniquement |

Clic sur un bloc : une **petite fenêtre flottante** (titre, catégorie, date et heure, durée, notes, supprimer). Pas de grande boîte de dialogue, pas de page séparée.

## 9. Mouvement

- Transitions de couleur et de fond : 120 ms. Ouverture d'un panneau : 180 ms.
- **Aucune animation pendant un glisser-déposer** (la fluidité prime).
- Respect de `prefers-reduced-motion` : animations désactivées.

## 10. Ce qu'on interdit (leçons de la v1)

- Fond sombre par défaut.
- Blocs entièrement colorés en couleur vive.
- Étoiles d'importance, emoji, badges empilés sur un même bloc.
- Plus de deux éléments d'information visibles sur un bloc sans action de l'utilisateur.
- Bordures sur tous les conteneurs, ombres partout.

## 11. Thème sombre (plus tard)

Toutes les couleurs passent par des variables CSS. Le thème sombre se limitera donc à redéfinir ces variables sous `[data-theme='dark']`. Il n'est pas conçu maintenant ; le thème clair est le seul à livrer et à peaufiner.

## 12. Questions encore ouvertes

- Accent **graphite** (proposé) ou une couleur vive (bleu, vert…) pour les boutons et le jour courant ?
- Blocs de tâche avec **barre latérale + fond léger** (proposé) ou seulement la barre latérale et un fond blanc ?
- Les heures déjà passées du jour courant doivent-elles être **légèrement estompées** ?
