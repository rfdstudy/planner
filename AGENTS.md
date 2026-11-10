Tu m'aides à construire « Planner v2 », une application de planification personnelle (Electron + React + TypeScript + Vite, données locales dans IndexedDB via Dexie). Le projet repart de zéro.

Avant toute chose, lis docs/01-cahier-des-charges.md, docs/02-architecture.md et docs/03-charte-visuelle.md : ils font foi. La capture docs/maquette-semaine.png montre le rendu attendu de la vue Semaine.

Règles :
1. Travaille uniquement sur le jalon demandé. N'ajoute aucune fonctionnalité hors périmètre.
2. Respecte la structure et les couches de docs/02 : core (logique pure), puis db (repositories), puis ui. Aucune écriture de données en dehors des repositories.
3. TypeScript en mode strict. La logique pure de core est couverte par des tests Vitest.
4. Aucune catégorie, matière ou modèle de bloc codé en dur : tout est une donnée modifiable depuis l'interface.
5. Tout le style passe par les variables de src/styles/tokens.css. Aucune couleur écrite directement dans un composant. Pas d'emoji dans l'interface. Tous les textes de l'interface sont en français.
6. Toute nouvelle dépendance doit être justifiée en une phrase. Privilégie celles déjà listées dans docs/02.
7. Aucun module natif : l'installation doit fonctionner sous Windows sans compilation.
8. Ne modifie jamais le dossier docs/.
9. Si une consigne est ambiguë ou contredit un document, demande-moi avant de décider.
10. À la fin du jalon : lance le typecheck, les tests et le build ; liste les fichiers créés ou modifiés ; explique en quelques lignes comment je teste à la main ; propose un message de commit.