# OptiSim — Simulateur d'Optique Géométrique

## Spécifications Techniques v1.0

---

## 1. Vision du projet

OptiSim est un simulateur interactif d'optique géométrique couvrant l'ensemble du domaine, du tracé de rayons classique au tracé courbe dans les milieux à gradient d'indice (GRIN). C'est un outil personnel d'exploration, conçu pour être précis physiquement, visuellement satisfaisant, et extensible.

### Ce que le projet couvre

- Toute l'optique géométrique sans approximation paraxiale
- Tracé de rayons exact avec émergence naturelle des aberrations
- Dispersion chromatique (Cauchy)
- Tracé courbe dans les milieux à gradient d'indice
- Coefficients de Fresnel (intensité, polarisation s/p, Brewster)
- Chemin optique et absorption (Beer-Lambert)

### Ce que le projet ne couvre PAS

- Diffraction (pas de tache d'Airy, pas de fentes)
- Interférences (pas de franges, pas de Michelson/Young)
- Cohérence et phase
- Polarisation complète (pas de Jones/Stokes/lames d'onde)
- Optique non-linéaire

---

## 2. Stack technique

| Composant | Choix | Justification |
|-----------|-------|---------------|
| Langage | TypeScript | Typage = sécurité pour la physique |
| Framework | React 18+ | Composants UI, état réactif |
| Build | Vite | HMR rapide, config minimale |
| Rendu | Canvas 2D | Suffisant pour du ray tracing 2D |
| Tests | Vitest | Natif Vite, rapide |
| Style | CSS Modules ou Tailwind | À décider en phase 1 |
| Linting | ESLint + Prettier | Cohérence du code |

### Évolutions possibles (non prioritaires)

- WebGL / Web Workers pour la performance (milliers de rayons)
- Three.js pour une vue 3D optionnelle
- PWA pour usage offline

---

## 3. Architecture

### Principe fondamental

**Séparation stricte entre le moteur physique, le rendu, et l'UI.**

Le moteur physique ne connaît pas le Canvas. Le rendu ne connaît pas React. L'UI ne connaît pas les maths. Chaque couche communique via des interfaces TypeScript bien définies.

```
src/
├── core/                    # Moteur physique (AUCUNE dépendance UI)
│   ├── types.ts             # Interfaces fondamentales
│   ├── vector.ts            # Algèbre vectorielle 2D
│   ├── ray.ts               # Structure et propagation d'un rayon
│   ├── intersection.ts      # Calculs d'intersection rayon/surface
│   ├── optics.ts            # Snell-Descartes, réflexion, réfraction
│   ├── fresnel.ts           # Coefficients de Fresnel (phase 5)
│   ├── dispersion.ts        # Loi de Cauchy, indices spectraux
│   ├── surfaces/            # Surfaces optiques
│   │   ├── plane.ts         # Surface plane
│   │   ├── spherical.ts     # Surface sphérique
│   │   ├── conic.ts         # Coniques généralisées (phase 3)
│   │   └── index.ts
│   ├── elements/            # Éléments optiques composés
│   │   ├── flat-mirror.ts
│   │   ├── curved-mirror.ts
│   │   ├── thin-lens.ts
│   │   ├── prism.ts
│   │   ├── block.ts
│   │   ├── grin-medium.ts   # Milieu GRIN (phase 4)
│   │   └── index.ts
│   ├── sources/             # Sources lumineuses
│   │   ├── point-source.ts
│   │   ├── beam.ts
│   │   └── index.ts
│   ├── tracer.ts            # Moteur de tracé (rayons droits)
│   ├── tracer-grin.ts       # Tracé courbe RK4 (phase 4)
│   ├── scene.ts             # Scène = sources + éléments
│   └── absorption.ts        # Beer-Lambert (phase 6)
│
├── renderer/                # Rendu Canvas (AUCUNE dépendance React)
│   ├── canvas-renderer.ts   # Rendu principal
│   ├── ray-renderer.ts      # Dessin des rayons (droits et courbes)
│   ├── element-renderer.ts  # Dessin des éléments optiques
│   ├── source-renderer.ts   # Dessin des sources
│   ├── grid-renderer.ts     # Grille de fond
│   ├── overlay-renderer.ts  # Annotations, mesures (phase 6)
│   ├── colors.ts            # Longueur d'onde → RGB
│   └── themes.ts            # Thèmes clair/sombre
│
├── ui/                      # Composants React
│   ├── App.tsx
│   ├── SimulatorCanvas.tsx   # Wrapper React du Canvas
│   ├── Toolbar.tsx           # Barre d'outils (ajout éléments)
│   ├── PropertiesPanel.tsx   # Panneau de propriétés
│   ├── PresetSelector.tsx    # Scènes prédéfinies
│   ├── SceneManager.tsx      # Import/export JSON
│   └── controls/
│       ├── SliderControl.tsx
│       ├── AngleControl.tsx
│       └── ColorPicker.tsx
│
├── interaction/             # Gestion des interactions utilisateur
│   ├── mouse-handler.ts     # Drag, click, hover
│   ├── wheel-handler.ts     # Zoom, rotation
│   ├── keyboard-handler.ts  # Raccourcis clavier
│   └── selection.ts         # Sélection d'éléments
│
├── serialization/           # Import/export
│   ├── scene-serializer.ts  # Scène → JSON
│   ├── scene-deserializer.ts # JSON → Scène
│   └── presets.ts           # Scènes prédéfinies
│
└── validation/              # Tests de validation physique
    ├── test-scenes.ts       # Scènes de référence
    ├── analytical.ts        # Résultats analytiques attendus
    └── comparator.ts        # Comparaison numérique/analytique
```

### Interfaces TypeScript fondamentales

```typescript
// === GÉOMÉTRIE ===

interface Vec2 {
  x: number;
  y: number;
}

// === RAYONS ===

interface Ray {
  origin: Vec2;
  direction: Vec2;        // Vecteur unitaire
  wavelength: number;     // nm (380-780)
  intensity: number;      // 0-1 (Fresnel, phase 5)
  polarization?: 's' | 'p' | 'unpolarized';  // Phase 5
  opticalPath?: number;   // Chemin optique cumulé (phase 6)
}

interface RaySegment {
  start: Vec2;
  end: Vec2;
  wavelength: number;
  intensity: number;
  // Pour le tracé courbe (phase 4) :
  curvePoints?: Vec2[];   // Points intermédiaires si tracé courbe
}

interface TraceResult {
  segments: RaySegment[];
  totalOpticalPath: number;
}

// === SURFACES ===

interface HitResult {
  point: Vec2;            // Point d'intersection
  normal: Vec2;           // Normale sortante
  t: number;              // Paramètre le long du rayon
  surfaceId: string;      // Identifiant de la surface touchée
}

interface OpticalSurface {
  id: string;
  intersect(ray: Ray): HitResult | null;
  getNormal(point: Vec2): Vec2;
  getRefractiveIndex(wavelength: number): number;
}

// === ÉLÉMENTS ===

interface OpticalElement {
  id: string;
  type: string;
  position: Vec2;
  angle: number;          // Degrés
  label: string;
  getSurfaces(): OpticalSurface[];
  getBoundingBox(): { min: Vec2; max: Vec2 };
  containsPoint(point: Vec2): boolean;
}

// === SOURCES ===

interface LightSource {
  id: string;
  type: 'point' | 'beam';
  position: Vec2;
  angle: number;
  wavelengths: number[];  // Liste de longueurs d'onde
  generateRays(): Ray[];
}

// === SCÈNE ===

interface Scene {
  elements: OpticalElement[];
  sources: LightSource[];
  metadata: {
    name: string;
    description?: string;
  };
}

// === MILIEU GRIN (phase 4) ===

interface GRINMedium {
  refractiveIndexAt(position: Vec2, wavelength: number): number;
  gradientAt(position: Vec2, wavelength: number): Vec2;
  containsPoint(point: Vec2): boolean;
}
```

---

## 4. Physique — Détail par phase

### Phase 1 : Fondations

**Loi de la réflexion**
```
θ_r = θ_i
r⃗ = d⃗ - 2(d⃗ · n⃗)n⃗
```

**Loi de Snell-Descartes (réfraction)**
```
n₁ sin(θ₁) = n₂ sin(θ₂)

Forme vectorielle :
t⃗ = (n₁/n₂)d⃗ + ((n₁/n₂)cos(θ₁) - cos(θ₂))n⃗
cos(θ₂) = √(1 - (n₁/n₂)²(1 - cos²(θ₁)))
```

**Réflexion totale interne**
```
Si sin(θ₂) = (n₁/n₂)sin(θ₁) > 1 → réflexion totale
Angle critique : θ_c = arcsin(n₂/n₁)   (n₁ > n₂)
```

**Lentille mince (sans approximation paraxiale)**
Pas de formule de conjugaison : on trace les rayons à travers les deux surfaces sphériques de la lentille, ou on utilise la déviation exacte en fonction de la hauteur d'incidence h :
```
δ(h) = -h/f    (approximation paraxiale, utilisée en phase 1)
```
Note : En phase 3, on remplacera par le tracé exact à travers les surfaces.

**Intersection rayon/segment**
```
Rayon : P = O + t·D, t > 0
Segment : Q = A + u·(B-A), u ∈ [0,1]
Résolution du système 2×2 pour (t, u)
```

**Intersection rayon/cercle**
```
|P - C|² = R²
Équation quadratique en t : at² + bt + c = 0
a = D·D, b = 2(O-C)·D, c = |O-C|² - R²
```

### Phase 2 : Dispersion et couleur

**Loi de Cauchy**
```
n(λ) = A + B/λ² + C/λ⁴
λ en µm

Coefficients typiques :
- Verre crown (BK7)  : A=1.5046, B=0.00420, C=0
- Verre flint (SF11) : A=1.7432, B=0.01154, C=0
- Eau                 : A=1.3199, B=0.00653, C=0
- Diamant             : A=2.3780, B=0.01210, C=0
```

**Conversion longueur d'onde → RGB**
Approximation du spectre visible (380-780nm) avec atténuation aux bords.

### Phase 3 : Surfaces avancées et aberrations

**Surfaces coniques**
```
z(r) = r² / (R × (1 + √(1 - (1+κ)r²/R²)))

κ = 0    → sphère
κ = -1   → parabole
κ < -1   → hyperbole
-1 < κ < 0 → ellipse prolate
κ > 0    → ellipse oblate
```

**Intersection rayon/conique**
Résolution numérique (Newton-Raphson) car pas de solution analytique simple pour κ ≠ 0.

**Aberrations visibles naturellement**
Pas de formule à implémenter : elles émergent du tracé exact.
- Aberration sphérique : rayons marginaux ne convergent pas au même point
- Coma : image asymétrique pour un objet hors axe
- Astigmatisme : deux focales différentes (sagittale/tangentielle)
- Courbure de champ : l'image nette est sur une surface courbe
- Distorsion : grandissement varie avec la distance à l'axe

### Phase 4 : Milieux GRIN et tracé courbe

**Équation de l'eikonale**
```
d/ds (n(r⃗) × dr⃗/ds) = ∇n(r⃗)

Système d'EDO :
  dr⃗/ds = p⃗/n
  dp⃗/ds = ∇n
où p⃗ = n × dr⃗/ds (vecteur impulsion optique)
```

**Intégration numérique (Runge-Kutta 4)**
```
Pas Δs le long de la trajectoire :

k1_r = p⃗/n(r⃗)
k1_p = ∇n(r⃗)

k2_r = (p⃗ + Δs/2 × k1_p) / n(r⃗ + Δs/2 × k1_r)
k2_p = ∇n(r⃗ + Δs/2 × k1_r)

(idem k3, k4)

r⃗_new = r⃗ + Δs/6 × (k1_r + 2k2_r + 2k3_r + k4_r)
p⃗_new = p⃗ + Δs/6 × (k1_p + 2k2_p + 2k3_p + k4_p)
```

**Profils d'indice classiques**
```
Linéaire :      n(y) = n₀ + α·y
Parabolique :   n(r) = n₀ × (1 - α²r²/2)     (fibre GRIN)
Atmosphérique : n(h) = 1 + (n₀-1) × exp(-h/H)  (mirages)
```

**Pas adaptatif**
```
Δs = min(Δs_max, ε / |∇n|)
Où ε contrôle la précision et |∇n| la rapidité de variation.
```

### Phase 5 : Coefficients de Fresnel

**Coefficients de réflexion**
```
r_s = (n₁cos(θ₁) - n₂cos(θ₂)) / (n₁cos(θ₁) + n₂cos(θ₂))
r_p = (n₂cos(θ₁) - n₁cos(θ₂)) / (n₂cos(θ₁) + n₁cos(θ₂))

Réflectance :
R_s = |r_s|²
R_p = |r_p|²
R_unpolarized = (R_s + R_p) / 2

Transmittance :
T = 1 - R  (conservation de l'énergie)
```

**Angle de Brewster**
```
θ_B = arctan(n₂/n₁)
À cet angle : R_p = 0, seule la composante s est réfléchie.
```

### Phase 6 : Chemin optique et absorption

**Chemin optique**
```
L = ∫ n(s) ds le long du rayon
Discrétisé : L = Σ n_i × Δs_i
```

**Loi de Beer-Lambert (absorption)**
```
I(s) = I₀ × exp(-α × s)
α = coefficient d'absorption (dépend du milieu et de λ)
```

---

## 5. Phasage de développement

### Phase 1 — Fondations (MVP)

**Moteur physique :**
- [x] Types et interfaces fondamentales (`Vec2`, `Ray`, `OpticalSurface`, etc.)
- [x] Algèbre vectorielle 2D (normalisation, dot, reflect, refract)
- [x] Intersection rayon/segment et rayon/cercle
- [x] Lois de Snell-Descartes (réflexion + réfraction)
- [x] Réflexion totale interne
- [x] Traceur de rayons (boucle intersection → interaction → propagation)
- [x] Éléments : miroir plan, miroir sphérique, lentille mince, prisme, bloc

**Rendu :**
- [x] Renderer Canvas 2D basique
- [x] Dessin des rayons (segments droits colorés)
- [x] Dessin des éléments optiques
- [x] Grille de fond
- [x] Thème sombre

**UI :**
- [x] Canvas interactif (drag pour déplacer, molette pour rotation)
- [x] Panneau de propriétés pour l'élément sélectionné
- [x] Barre d'outils pour ajouter des éléments
- [x] Sélecteur de scènes prédéfinies
- [x] Import/export JSON

**Validation :**
- [x] Test : rayon réfléchi sur miroir plan (θ_r = θ_i)
- [x] Test : réfraction verre/air à 30° (vérif analytique)
- [x] Test : réflexion totale interne au-delà de θ_c
- [x] Test : lentille convergente, faisceau parallèle → convergence au foyer
- [x] Test : prisme, déviation minimale

**Livrable :** Application fonctionnelle avec tracé de rayons interactif sur les éléments de base.

### Phase 2 — Dispersion chromatique

- [x] Implémentation de la loi de Cauchy avec coefficients par matériau
- [x] Base de données de matériaux (BK7, SF11, eau, diamant, etc.)
- [x] Sources polychromatiques (spectre discret configurable)
- [x] Conversion longueur d'onde → RGB réaliste
- [x] Rendu des rayons par couleur spectrale avec glow

**Validation :**
- [x] Test : dispersion par prisme — vérif angles pour rouge et bleu
- [x] Test : déviation minimale du prisme = f(n, A)
- [x] Test : aberration chromatique visible sur lentille simple

### Phase 3 — Surfaces coniques et aberrations

- [x] Surfaces coniques paramétriques (κ variable)
- [x] Intersection rayon/conique (Newton-Raphson)
- [x] Miroir parabolique (κ = -1)
- [x] Miroir elliptique, hyperbolique (slider κ avec label dynamique)
- [x] Lentille épaisse (tracé à travers 2 surfaces)

**Validation :**
- [x] Test : miroir parabolique — faisceau parallèle → foyer exact
- [x] Test : aberration sphérique visible sur miroir sphérique
- [x] Test : comparaison sphérique vs parabolique

### Phase 4 — Milieux GRIN et tracé courbe

- [x] Intégrateur RK4 pour l'équation de l'eikonale
- [x] Pas adaptatif (Δs proportionnel à 1/|∇n|)
- [x] Profils d'indice : linéaire, parabolique, exponentiel, custom (gradient 2D αx+αy)
- [x] Rendu des trajectoires courbes (polylignes lissées)
- [x] Éléments : fibre GRIN, atmosphère (mirage)

**Validation :**
- [x] Test : gradient linéaire — trajectoire parabolique (solution analytique)
- [x] Test : fibre GRIN parabolique — trajectoire sinusoïdale
- [x] Test : conservation du chemin optique dans un gradient

### Phase 5 — Fresnel et énergie

- [ ] Coefficients de Fresnel (R_s, R_p, T)
- [ ] Propagation de l'intensité le long des rayons
- [ ] Rendu de l'intensité (épaisseur ou opacité du rayon)
- [ ] Angle de Brewster visible
- [ ] Choix de polarisation sur les sources (s, p, non polarisé)
- [ ] Rayons réfléchis partiels (split du rayon aux interfaces)

**Validation :**
- [ ] Test : Brewster — R_p = 0 à l'angle attendu
- [ ] Test : incidence normale — R = ((n₁-n₂)/(n₁+n₂))²
- [ ] Test : conservation de l'énergie (R + T = 1)

### Phase 6 — Enrichissements

- [ ] Calcul et affichage du chemin optique
- [ ] Absorption Beer-Lambert (coefficient α par milieu)
- [ ] Annotation des foyers, plans principaux
- [ ] Systèmes prédéfinis : télescope Newton, Cassegrain, doublet achromat
- [ ] Mode mesure (distances, angles affichés)

---

## 6. Scènes de validation physique

Chaque scène a un résultat analytique calculable à la main.

| # | Scène | Résultat attendu |
|---|-------|-----------------|
| 1 | Rayon à 45° sur miroir plan | Réfléchi à 45° de l'autre côté |
| 2 | Rayon à 30° air→verre (n=1.5) | θ₂ = arcsin(sin30°/1.5) = 19.47° |
| 3 | Rayon à 45° verre→air (n=1.5) | Réflexion totale (θ_c = 41.81°) |
| 4 | Faisceau parallèle → lentille f=100 | Convergence à 100px du centre |
| 5 | Prisme 60°, n=1.5, incidence min | Déviation minimale δ = 2×arcsin(n×sin(A/2)) - A = 37.18° |
| 6 | Gradient linéaire n(y) = 1 + 0.001y | Trajectoire parabolique |
| 7 | Fibre GRIN parabolique | Trajectoire sinusoïdale, période = 2π/α |
| 8 | Brewster air→verre n=1.5 | θ_B = 56.31°, R_p = 0 |
| 9 | Miroir parabolique, faisceau parallèle | Tous les rayons convergent au foyer exact |
| 10 | Incidence normale air→verre n=1.5 | R = 4%, T = 96% |

---

## 7. Conventions

- **Angles** : en degrés dans l'UI, en radians dans le moteur
- **Distances** : en pixels à l'écran, pas d'unité physique (l'échelle est libre)
- **Longueurs d'onde** : en nanomètres (380-780 nm)
- **Indices de réfraction** : sans unité, typiquement entre 1.0 et 2.5
- **Intensité** : normalisée 0-1
- **Sens des normales** : toujours orientées vers le rayon incident
- **Sens de propagation** : les rayons vont de gauche à droite par convention dans les presets

---

## 8. Performance

**Cibles :**
- 60 FPS avec < 100 rayons et < 20 éléments
- < 1s de tracé pour 1000 rayons (cas complexe)
- Tracé GRIN : pas adaptatif pour éviter le calcul inutile

**Stratégies :**
- Pas de ré-allocation dans la boucle de tracé (pré-allouer les tableaux)
- Bounding box test avant les intersections détaillées
- Recalcul uniquement quand la scène change (pas à chaque frame)
- Web Workers si nécessaire (futur)
