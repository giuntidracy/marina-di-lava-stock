# CLAUDE.md

Règles de travail pour Claude Code, inspirées des 4 règles de Boris Cherny (créateur de Claude Code), nuancées à l'usage réel.

> **Principe général** : ces règles sont des *defaults intelligents*, pas des commandements rigides. À suivre par défaut, à enfreindre consciemment quand le contexte le justifie.

---

## 01 — Plan d'abord (proportionnel à la complexité)

**Écris le plan avant de coder, quand la tâche le mérite.**

- Tâche non triviale (>10 lignes, plusieurs fichiers, logique métier) → plan complet **avant** toute ligne de code.
- Si ça dérape en cours de route : STOP, refais le plan.
- **Exception** : fix de typo, renommage simple, one-liner → pas besoin de plan, go direct.

*Proportionne l'effort de planification à la complexité réelle. Un plan pour changer un mot, c'est de la bureaucratie.*

---

## 02 — Sous-agents : pour isoler, pas par réflexe

**Délègue à un sous-agent quand la tâche est vraiment isolée.**

- Oui pour : recherches parallèles (3 questions indépendantes en même temps), exploration large du codebase, travail qui va polluer le contexte principal.
- Non pour : tâches courtes, tâches qui ont besoin du contexte de notre conversation, travail itératif avec retours utilisateur.
- **1 tâche vraiment isolée = 1 sous-agent dédié**, pas "toute tâche complexe".

*Les sous-agents n'ont pas l'historique de la conversation. Mal utilisés, ils dupliquent du travail et ajoutent de la latence.*

---

## 03 — Chaque erreur récurrente devient une règle 🏆

**La règle la plus importante. C'est elle qui fait progresser le système dans le temps.**

- Erreur détectée qui risque de se reproduire → transforme-la en règle.
- Sauvegarde-la dans ce CLAUDE.md, section appropriée.
- **Garde-le court** : max ~20 règles actives. Si une règle devient obsolète, supprime-la.
- Une règle = une phrase claire + le contexte où elle s'applique.

*Un CLAUDE.md qui gonfle sans cesse devient du bruit. Un CLAUDE.md curé devient une mémoire utile.*

---

## 04 — Pas de "done" sans preuve

**Ne marque jamais une tâche terminée sans vérification concrète.**

- Code : exécute les tests, vérifie les logs, lance la commande.
- UI / visuel : si tu ne peux pas vérifier toi-même (navigateur, rendu), **dis-le explicitement** plutôt que prétendre avoir testé.
- Pas de supposition : "ça devrait marcher" ≠ "ça marche".

*La plus grande frustration avec une IA, c'est le faux "done". Mieux vaut dire "je n'ai pas pu vérifier X" que mentir par défaut.*

---

## Règles spécifiques au projet Marina di Lava Stock

### R-01 — Cache-buster après modif frontend
À chaque modification de `static/app.js` ou `static/style.css`, **incrémenter le paramètre `?v=...`** dans `static/index.html` (lignes `<link rel="stylesheet">` et `<script src="/static/app.js">`). Sinon Safari iOS (et navigateurs en général) servent l'ancienne version depuis le cache → l'utilisateur ne voit jamais le nouveau code, même après reload.

Format conseillé : `?v=YYYYMMDDa` (a → b → c si plusieurs déploiements le même jour).

### R-02 — Toujours vérifier l'existant avant d'ajouter un widget/section
Avant d'ajouter un widget dashboard, une card, une métrique ou une nouvelle section UI, **relire tout ce qui est déjà rendu** dans la même vue (`renderDashboard`, `renderStock`, etc.) pour éviter les doublons. Chercher par mot-clé (`Valeur stock`, `Alertes`, `Marge`…) dans `app.js`. Un KPI dans `db-kpi-row` compte aussi comme existant.

Exemple d'erreur à ne pas reproduire : ajouter un widget "Valeur du stock" alors qu'il y en avait déjà un dans le `db-kpi-row` en haut du dashboard.
