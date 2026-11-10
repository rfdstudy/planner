# Planner v2 – Cahier des charges

*Document de référence à fournir à l'agent de code. Projet repris de zéro (le code de la v1 n'est pas réutilisé).*

## 1. Vision

Une application de planification **personnelle, gratuite et sans abonnement**, pensée pour un élève de classe préparatoire. Elle doit permettre de **préparer le lendemain en quelques minutes** : poser les temps fixes, repérer les créneaux libres, y glisser les tâches à faire, puis ajouter du temps libre.

Trois mots d'ordre : **fluide**, **épurée**, **claire** (thème clair par défaut).

## 2. Usage cible

Routine du soir :

1. Les cours et les temps indispensables (repas, douche, préparation) sont déjà en place.
2. On repère les creux restants.
3. On y glisse les devoirs et entraînements prépa depuis la liste « À planifier ».
4. S'il reste du temps, on place des blocs de temps libre (sport, jeu…).

En plus : voir la semaine pour anticiper les DS, évaluations et khôlles.

## 3. Périmètre

### Priorité 1 : application PC (.exe via Electron)

- Vue **Semaine** (vue principale)
- Vue **Jour**
- Panneau **À planifier**
- **Semaine type** (blocs fixes récurrents)
- **Catégories modifiables** depuis l'interface
- Glisser-déposer fluide

### Priorité 2 : version téléphone (plus tard)

- Lecture seule de la **journée en cours** : créneaux libres, tâche à faire, tâches du soir
- Publication en page web (GitHub Pages), installable comme PWA

### Hors MVP

Notifications, synchro multi-appareils, import Google/Outlook, IA, statistiques. À prévoir dans la structure, pas dans le premier livrable.

## 4. Types d'éléments

| Type | Exemples | Rendu visuel |
| --- | --- | --- |
| **Fixe** | cours, repas, douche, coucher | gris neutre, sans couleur de catégorie |
| **Tâche** | réviser un cours, exercices, DM | point de couleur de la catégorie |
| **Épreuve** | DS, khôlle, évaluation | petit marqueur d'alerte + « J-3 » |
| **Libre** | sport, jeu, détente | teinte claire, bordure douce |

Règle : **seule la catégorie utilise une couleur**, et seulement sur les tâches (point ou fine barre latérale). Le reste de l'interface est neutre.

## 5. Fonctionnalités détaillées

### 5.1 Vue Semaine (principale)

- 7 colonnes (lundi → dimanche), échelle horaire verticale, ligne de l'heure actuelle.
- Une **ligne en haut de chaque jour** pour les épreuves et échéances.
- Navigation semaine précédente / suivante, bouton « Aujourd'hui ».
- Un bloc affiche seulement **titre + heure**. Les détails apparaissent au clic ou au survol.
- Les créneaux libres **ne s'affichent que pendant un glisser-déposer**.

### 5.2 Vue Jour

Même logique qu'en semaine, sur une seule colonne, pour la préparation du soir.

### 5.3 À planifier

- Panneau latéral repliable.
- Ajout rapide : titre + catégorie (durée estimée facultative).
- Glisser une tâche vers la grille crée un bloc ; une même tâche peut avoir plusieurs blocs, y compris sur plusieurs jours. Elle reste dans la liste, avec le temps restant, tant que ses blocs ne couvrent pas sa durée estimée, puis la quitte (tout de suite si elle n'a pas de durée estimée). Une tâche cochée reste affichée, grisée.
- Remettre une tâche dans « À planifier » reste possible en la glissant de la grille vers le panneau.
- Filtre par catégorie.

### 5.3 bis Semaine type

- On définit une fois les blocs fixes de chaque jour (cours, repas, douche, coucher).
- Chaque nouvelle semaine est **préremplie** automatiquement.
- Modifier un bloc pour une seule semaine ne change pas le modèle ; l'app propose aussi « modifier toutes les semaines ».

### 5.4 Glisser-déposer

- Déplacement avec un pas de **15 minutes**.
- Redimensionnement de la durée par le bord inférieur du bloc.
- Mise en évidence des créneaux libres pendant le geste.
- Annulation de la dernière action (`Ctrl+Z`).
- Fluidité exigée : aucun saccade pendant le déplacement.

### 5.5 Catégories entièrement modifiables dans l'interface

Écran « Catégories » (accessible depuis un menu ou la palette de commandes) :

- **Créer** une catégorie (nom, couleur).
- **Renommer**, **changer la couleur**, **réordonner**.
- **Archiver** ou **supprimer**. Si la catégorie contient des éléments, l'app demande : les réaffecter à une autre catégorie, ou les laisser sans catégorie.
- Aucune catégorie n'est codée en dur : au premier lancement, l'app propose des catégories de départ (modifiables et supprimables comme les autres).
- Même principe pour les **modèles de blocs fixes** et les durées par défaut : tout ce qui peut changer est une donnée, jamais du code.

### 5.6 Saisie rapide et clavier

- Palette de commandes (`Ctrl+K`).
- `N` : nouvelle tâche · `E` : nouvel élément fixe · `T` : aujourd'hui · `←` `→` : navigation · `Échap` : fermer.

## 6. Principes d'interface

- Thème **clair** par défaut ; sombre en option plus tard.
- Une seule police, beaucoup d'espace blanc, peu de bordures, une seule couleur d'accent.
- **Divulgation progressive** : l'information secondaire n'apparaît que sur demande.
- Maximum d'éléments visibles à la fois : la grille, le panneau « À planifier », rien d'autre.

## 7. Exigences techniques

- **Une seule application web** (React + TypeScript + Vite), encapsulée dans Electron pour le `.exe`.
- Stockage local dans **IndexedDB** (Dexie), mises à jour immédiates puis sauvegarde en arrière-plan.
- Chaque donnée possède un `id` unique, une date de création, une date de modification et un état « supprimé » (pour permettre une synchro future).
- Récurrence au format standard **RRULE**.
- Export / import **JSON** de sauvegarde, et export **ICS** du calendrier.
- Aucune donnée personnelle dans le dépôt Git.

## 8. Évolutions prévues (non MVP)

1. Version téléphone en lecture seule (journée en cours).
2. Synchro PC ↔ téléphone (service gratuit ou fichier cloud, à décider).
3. Import de calendriers (ICS, Google).
4. Aide à la planification par IA.

## 9. Critères de réussite du MVP

- Préparer une journée complète en **moins de 5 minutes**.
- Aucun saccade lors du glisser-déposer.
- Une catégorie peut être créée, renommée, recolorée ou supprimée **sans toucher au code**.
- Un coup d'œil sur la semaine montre immédiatement les épreuves à venir.

## 10. Questions encore ouvertes

- Liste de départ des catégories : matières, projets
- Les épreuves ont-elles besoin d'un niveau d'importance, ou le simple marqueur suffit-il ? Non pas de niveau d'importance.&#32;
- Durée de la plage horaire affichée : la journée complète de 00h à 23h.
