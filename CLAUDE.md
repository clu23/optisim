# CLAUDE.md — OptiSim

## Projet

OptiSim est un simulateur interactif d'optique géométrique (TypeScript + React + Canvas 2D, tooling Vite).
Il couvre le tracé de rayons exact, la dispersion, les surfaces coniques, les milieux GRIN (tracé courbe), les coefficients de Fresnel, et l'absorption.

Le développement est progressif en 6 phases. Voir `SPECS.md` pour le détail complet.

---

## Architecture — Règles strictes

### Séparation en couches

```
core/       → Moteur physique pur. ZÉRO import de React, Canvas, DOM.
renderer/   → Rendu Canvas 2D. ZÉRO import de React. Reçoit un CanvasRenderingContext2D.
ui/         → Composants React. Ne fait AUCUN calcul physique.
interaction/ → Gestion souris/clavier. Traduit les events en actions sur la scène.
serialization/ → Import/export JSON des scènes.
validation/ → Scènes de test avec résultats analytiques.
```

**Règle absolue :** Si tu ajoutes un `import` qui traverse les couches (ex: `core/` importe depuis `renderer/`), c'est une erreur d'architecture. Corrige-la.

### Interfaces TypeScript

Tout élément optique implémente `OpticalElement`. Toute surface implémente `OpticalSurface`. Voir `core/types.ts` pour les définitions.

Quand tu crées un nouvel élément optique :
1. Il DOIT implémenter `OpticalElement`
2. Ses surfaces DOIVENT implémenter `OpticalSurface`
3. Il DOIT avoir un test de validation physique
4. Il DOIT être rendu par `element-renderer.ts`
5. Il DOIT être sérialisable en JSON

### Nommage

- Fichiers : `kebab-case.ts`
- Types/Interfaces : `PascalCase`
- Fonctions/variables : `camelCase`
- Constantes physiques : `SCREAMING_SNAKE_CASE`

---

## Commandes

```bash
npm run dev          # Lancement dev (Vite HMR)
npm run build        # Build production
npm run test         # Tous les tests (Vitest)
npm run test:physics # Tests de validation physique uniquement
npm run lint         # ESLint
npm run typecheck    # Vérification TypeScript sans émission
```

---

## Workflow de développement

### Avant de coder une feature

1. Identifie à quelle phase elle appartient (voir SPECS.md §5)
2. Vérifie que les phases précédentes sont complètes
3. Lis les formules physiques concernées (SPECS.md §4)

### Checklist — Ajout d'un élément optique

- [ ] Créer le fichier dans `core/elements/`
- [ ] Implémenter `OpticalElement` et retourner des `OpticalSurface[]`
- [ ] Ajouter les intersections dans `core/intersection.ts` si nouvelle géométrie
- [ ] Ajouter le rendu dans `renderer/element-renderer.ts`
- [ ] Ajouter la sérialisation dans `serialization/`
- [ ] Écrire au minimum 1 test de validation physique avec résultat analytique
- [ ] Ajouter dans la toolbar UI
- [ ] Ajouter dans le panneau de propriétés
- [ ] Vérifier que `npm run test` passe
- [ ] Vérifier que `npm run typecheck` passe

### Checklist — Modification du moteur physique

- [ ] Lancer `npm run test:physics` AVANT de commencer (baseline)
- [ ] Faire la modification
- [ ] Lancer `npm run test:physics` APRÈS (aucune régression)
- [ ] Si nouveau phénomène physique : ajouter un test analytique dans `validation/`
- [ ] Vérifier les unités (radians dans core, degrés dans l'UI)
- [ ] Vérifier les cas limites : angle rasant (θ→90°), incidence normale (θ=0°), indice = 1

### Checklist — Modification UI/Rendu

- [ ] Vérifier que le drag & drop fonctionne toujours
- [ ] Vérifier que la molette (rotation) fonctionne
- [ ] Vérifier que le panneau de propriétés se met à jour en temps réel
- [ ] Tester en thème sombre ET clair
- [ ] Vérifier la lisibilité des rayons (opacité, couleur, glow)

---

## Validation physique

### Principe

Chaque phénomène physique a au moins une scène de test dont le résultat est calculable analytiquement. Les tests comparent la sortie du moteur au résultat analytique avec une tolérance numérique (typiquement ε = 1e-6 pour les angles, 1e-3 pour les positions).

### Scènes de référence

| ID | Description | Formule de vérification |
|----|-------------|------------------------|
| V1 | Réflexion miroir plan 45° | θ_r = θ_i = 45° |
| V2 | Réfraction air→verre 30° | θ₂ = arcsin(sin(30°)/1.5) = 19.471° |
| V3 | Réflexion totale 45° verre→air | sin(45°) × 1.5 > 1 → réflexion |
| V4 | Lentille f=100, rayon parallèle h=50 | Croise l'axe à x = f = 100 |
| V5 | Déviation minimale prisme 60° n=1.5 | δ_min = 37.18° |
| V6 | Gradient linéaire | Trajectoire parabolique y(x) |
| V7 | GRIN parabolique | Trajectoire sinusoïdale, T = 2π/α |
| V8 | Brewster air→verre n=1.5 | θ_B = 56.31°, R_p = 0 |
| V9 | Miroir parabolique, 5 rayons parallèles | Tous convergent au même point (à ε près) |
| V10 | Fresnel incidence normale n=1.5 | R = ((0.5)/(2.5))² = 4% |

### Structure des tests

```typescript
// validation/test-scenes.ts
interface ValidationScene {
  id: string;
  description: string;
  scene: Scene;
  assertions: ValidationAssertion[];
}

interface ValidationAssertion {
  description: string;
  check: (result: TraceResult[]) => boolean;
  tolerance: number;
}
```

---

## Physique — Aide-mémoire

### Formules critiques

**Réfraction vectorielle :**
```
t⃗ = (n₁/n₂)d⃗ + ((n₁/n₂)(−d⃗·n⃗) − √(1 − (n₁/n₂)²(1−(d⃗·n⃗)²))) × n⃗
```

**Cauchy :** `n(λ) = A + B/λ² + C/λ⁴` (λ en µm)

**Eikonale :** `d/ds(n·dr⃗/ds) = ∇n`

**Fresnel :**
```
r_s = (n₁cosθ₁ − n₂cosθ₂)/(n₁cosθ₁ + n₂cosθ₂)
r_p = (n₂cosθ₁ − n₁cosθ₂)/(n₂cosθ₁ + n₁cosθ₂)
```

### Pièges courants

- **Orientation des normales** : toujours vers le rayon incident. Si `d⃗·n⃗ > 0`, inverser `n⃗`.
- **Entrée vs sortie d'un milieu** : tracker si on est "à l'intérieur" d'un élément pour inverser n₁/n₂.
- **Réflexion totale** : vérifier `sin²(θ₂) > 1` AVANT de calculer la racine carrée.
- **Angle de Cauchy** : λ doit être en **micromètres**, pas en nanomètres.
- **RK4 dans GRIN** : renormaliser `p⃗` à chaque pas pour éviter la dérive numérique.
- **Coniques** : Newton-Raphson peut diverger si le point initial est mauvais. Utiliser l'intersection sphérique comme point de départ.

---

## Phases du projet

Le développement suit 6 phases séquentielles. Ne commence PAS une phase si la précédente n'est pas complète (tous les tests passent, tous les items cochés).

- **Phase 1** : Fondations (rayons droits, Snell-Descartes, éléments de base, UI interactive)
- **Phase 2** : Dispersion chromatique (Cauchy, matériaux, spectre)
- **Phase 3** : Surfaces coniques et aberrations (κ, Newton-Raphson, lentilles épaisses)
- **Phase 4** : Milieux GRIN et tracé courbe (eikonale, RK4, pas adaptatif)
- **Phase 5** : Fresnel et énergie (intensité, polarisation s/p, Brewster)
- **Phase 6** : Enrichissements (chemin optique, Beer-Lambert, systèmes complets)

Voir `SPECS.md` pour le détail de chaque phase avec les checkboxes.

---

## Style de code

- Pas de `any`. Typage strict partout.
- Fonctions pures dans `core/` autant que possible (pas d'effets de bord).
- Commenter les formules physiques avec leur nom et une référence (ex: `// Loi de Snell-Descartes : n₁sinθ₁ = n₂sinθ₂`).
- Les constantes physiques (vitesse de la lumière, indices connus) dans un fichier dédié `core/constants.ts`.
- Préférer les fonctions courtes et composables aux classes monolithiques.
- Les tests de validation physique dans `validation/` sont aussi importants que le code — les maintenir à jour.

---

## Ce qu'il ne faut PAS faire

- Importer React ou le DOM dans `core/`
- Faire des calculs physiques dans les composants React
- Utiliser des `magic numbers` sans commentaire (toujours nommer les constantes)
- Ignorer un test qui échoue pour "avancer"
- Ajouter un élément optique sans test de validation
- Approximer quand on peut calculer exactement
- Oublier de gérer la réflexion totale interne (cas sin²θ₂ > 1)
