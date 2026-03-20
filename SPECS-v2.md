# OptiSim — Spécifications Phase 7 : Proto-Design

## Extension des spécifications v1.0 → v2.0

---

## Vue d'ensemble

Cette phase transforme OptiSim d'un simulateur exploratoire en un outil de proto-design optique capable de produire des résultats quantitatifs vérifiables. Le développement est découpé en 4 sous-phases progressives.

---

## Phase 7A — Unités physiques et catalogue de verres

### Objectif
Passer des pixels aux millimètres, et donner accès aux vrais verres optiques.

### Système d'unités

**Principe :** Tout le moteur physique travaille en unités internes (millimètres). Le renderer convertit en pixels via un facteur d'échelle.

```typescript
interface WorldUnits {
  scale: number;          // mm par pixel à zoom=1
  displayUnit: 'mm' | 'µm' | 'cm';
}

interface SceneMetadata {
  name: string;
  description?: string;
  units: WorldUnits;
}
```

**Règle de conversion :**
```
position_mm = position_px × scale
focal_mm = focal_px × scale
```

**Affichage :**
- Règle graduée sur le canvas (horizontale + verticale)
- Toutes les valeurs du panneau de propriétés affichées en mm
- Tooltip de mesure en mm
- Basculement px ↔ mm dans les préférences

### Catalogue de verres

**Source des données :** Coefficients de Sellmeier des catalogues Schott et Ohara (données publiques, disponibles sur refractiveindex.info).

**Remplacement de Cauchy par Sellmeier :**
```
n²(λ) = 1 + B₁λ²/(λ²-C₁) + B₂λ²/(λ²-C₂) + B₃λ²/(λ²-C₃)
λ en µm
```

Cauchy reste disponible comme fallback pour les matériaux custom.

**Structure de données :**
```typescript
interface GlassCatalog {
  id: string;              // ex: "SCHOTT"
  glasses: GlassData[];
}

interface GlassData {
  id: string;              // ex: "N-BK7"
  catalog: string;
  sellmeier: {
    B1: number; B2: number; B3: number;
    C1: number; C2: number; C3: number;
  };
  nD: number;              // Indice à 589.3nm (pré-calculé)
  abbeNumber: number;      // νD = (nD-1)/(nF-nC)
  transmission?: {         // Transmission interne à 10mm
    wavelengths: number[];
    values: number[];
  };
  density?: number;        // g/cm³
  name: string;            // Nom complet
}
```

**Verres prioritaires (lot 1, ~30 verres) :**

Crowns : N-BK7, N-K5, N-SK16, N-BAK4, N-LAK9, N-LAK33, N-PSK53A, N-FK51A, N-PK52A
Flints : N-SF11, N-SF6, N-SF57, N-F2, N-BAF10, N-BASF64, N-LASF9, N-LASF44
Spéciaux : N-FK5 (faible dispersion), P-SF68 (haute dispersion), LITHOTEC-CAF2 (fluorine)

**UI du sélecteur de verre :**
- Dropdown avec recherche textuelle
- Affichage nD et νD à côté du nom
- Diagramme d'Abbe interactif (nD en ordonnée, νD en abscisse) : clic sur un point = sélection du verre
- Les verres du système actuel sont mis en évidence sur le diagramme

### Checklist Phase 7A

- [ ] Système d'unités WorldUnits dans Scene
- [ ] Conversion px ↔ mm dans tout le panneau de propriétés
- [ ] Règle graduée sur le canvas
- [ ] core/glass-catalog.ts avec formule de Sellmeier
- [ ] Données de ~30 verres Schott
- [ ] Sélecteur de verre dans PropertiesPanel (dropdown + recherche)
- [ ] Diagramme d'Abbe interactif
- [ ] Migration des matériaux existants (BK7, SF11) vers Sellmeier
- [ ] Tests : indices Sellmeier vs valeurs Schott de référence (nD, nF, nC à ±1e-5)
- [ ] Tests : compatibilité ascendante avec les scènes JSON existantes

---

## Phase 7B — Spot diagram et métriques de qualité

### Objectif
Évaluer quantitativement la qualité d'image d'un système optique.

### Plan image

```typescript
interface ImagePlane {
  id: string;
  position: Vec2;          // Centre du plan
  angle: number;           // Orientation (rad)
  height: number;          // Demi-hauteur
  label: string;
}
```

Nouvel élément draggable sur le canvas. Les rayons qui le croisent sont collectés.

### Spot diagram

**Principe :** On trace N rayons depuis un point objet (ou un faisceau parallèle pour un objet à l'infini), on collecte leurs intersections avec le plan image, et on affiche le nuage de points.

```typescript
interface SpotData {
  hits: Vec2[];             // Points d'impact sur le plan image
  centroid: Vec2;           // Centre de gravité
  rmsRadius: number;        // RMS spot size = √(Σ(ri - centroid)²/N)
  maxRadius: number;        // Rayon du cercle englobant
  geoRadius: number;        // Rayon géométrique (le plus grand écart)
}
```

**Affichage :**
- Fenêtre popup ou panneau dédié montrant le spot diagram
- Échelle en µm (ou mm selon la taille)
- Cercle RMS et cercle englobant dessinés
- Valeur numérique du RMS spot size
- Curseur pour déplacer le plan image le long de l'axe → trouver le best focus

**Nombre de rayons :** Configurable, défaut 100, max 1000. Distribution uniforme sur la pupille d'entrée.

### Ray fan (aberrations transverses)

**Principe :** Pour un point objet donné, on trace des rayons à différentes hauteurs h dans la pupille, et on mesure l'écart transverse Δy au plan image par rapport au rayon chef.

```typescript
interface RayFanData {
  heights: number[];        // h normalisé [-1, 1]
  transverseError: number[]; // Δy en mm
  wavelength: number;
}
```

**Affichage :**
- Graphe Δy(h) pour chaque longueur d'onde
- Superposition de plusieurs λ pour voir l'aberration chromatique
- Identification visuelle : courbe cubique = sphérique, linéaire = defocus, en S = coma

### Aberration chromatique longitudinale

**Graphe :** Position du foyer (mm) en fonction de λ (nm).
- Calculé en traçant un faisceau paraxial pour chaque λ et en trouvant le point de convergence
- Un système corrigé (achromat) montre une courbe plate
- Un système non corrigé montre une courbe monotone

### Checklist Phase 7B

- [ ] Élément ImagePlane (draggable, collecte les hits)
- [ ] Calcul SpotData (centroid, RMS, max radius)
- [ ] Affichage spot diagram (panneau dédié, échelle µm)
- [ ] Curseur best focus (déplacement du plan image)
- [ ] Ray fan : calcul et affichage Δy(h)
- [ ] Aberration chromatique longitudinale : graphe focus(λ)
- [ ] Tests : système parfait (miroir parabolique) → RMS ≈ 0
- [ ] Tests : lentille simple → RMS > 0, diminue avec diaphragme
- [ ] Tests : doublet achromat → chromatique longitudinale < lentille simple

---

## Phase 7C — Objet, image, diaphragme et pupilles

### Objectif
Modéliser un système optique complet avec objet, image, ouverture et champ.

### Objet optique

```typescript
interface OpticalObject {
  id: string;
  position: Vec2;
  height: number;           // Demi-hauteur de la flèche
  type: 'finite' | 'infinity';  // Objet à distance finie ou infini
  fieldAngle?: number;      // Si infinity : demi-angle de champ (rad)
  wavelengths: number[];
  numRays: number;          // Rayons par point
}
```

**Objet fini :** Flèche verticale. Trace des rayons depuis la pointe et la base.
**Objet à l'infini :** Faisceau parallèle incliné selon fieldAngle.

### Image

Calcul automatique de la position et de la taille de l'image formée par le système :
- Image réelle : les rayons convergent → point d'intersection
- Image virtuelle : les rayons divergent → prolongement en arrière
- Grandissement : rapport taille image / taille objet
- Affichage d'une flèche image (bleue) à côté de la flèche objet (rouge)

### Diaphragme

```typescript
interface Aperture {
  id: string;
  position: Vec2;
  angle: number;
  diameter: number;          // Diamètre de l'ouverture (mm)
  label: string;
}
```

Nouvel élément optique qui bloque les rayons en dehors de l'ouverture.

### Pupilles et nombre d'ouverture

**Pupille d'entrée (PE) :** Image du diaphragme à travers les éléments qui le précèdent.
**Pupille de sortie (PS) :** Image du diaphragme à travers les éléments qui le suivent.

```typescript
interface PupilData {
  entrancePupil: { position: number; diameter: number };
  exitPupil: { position: number; diameter: number };
  fNumber: number;           // f/N = focale / diamètre PE
  numericalAperture: number; // NA = n × sin(θ_max)
}
```

Affichage des pupilles en pointillés sur le canvas quand activé.

### Champ de vue

Tracer des faisceaux à plusieurs angles de champ (0°, 25%, 50%, 75%, 100% du champ max) pour évaluer les performances hors axe. Chaque angle de champ produit son propre spot diagram.

### Checklist Phase 7C

- [ ] Élément OpticalObject (flèche, fini/infini)
- [ ] Calcul et affichage de l'image (position, grandissement)
- [ ] Élément Aperture (diaphragme)
- [ ] Calcul des pupilles d'entrée et de sortie
- [ ] Nombre d'ouverture f/N et ouverture numérique NA
- [ ] Multi-champ : faisceaux à 0°, 50%, 100% du champ
- [ ] Tests : objet au foyer d'une lentille → image à l'infini
- [ ] Tests : grandissement d'une lentille mince = -v/u
- [ ] Tests : diaphragme bloque les rayons hors ouverture

---

## Phase 7D — Prescription, optimiseur et coating

### Objectif
Outils avancés de proto-design : export, optimisation mono-variable, et traitements de surface.

### Tableau de prescription

Format standard utilisé par tous les logiciels d'optique :

```
Surface | Rayon (mm) | Épaisseur (mm) | Matériau  | Diam. (mm) | Conique κ
--------|------------|----------------|-----------|------------|----------
OBJ     | ∞          | 1000.00        | AIR       |            |
1       | 51.12      | 6.00           | N-BK7     | 25.0       | 0
2       | -51.12     | 2.00           | N-SF11    | 25.0       | 0
3       | -200.00    | 197.50         | AIR       | 25.0       | 0
STO     | ∞          | 0.00           | AIR       | 20.0       |
IMA     | ∞          |                |           |            |
```

**Export :** CSV et copie dans le presse-papier.
**Import :** Coller un tableau de prescription → reconstruction automatique du système.

### Optimiseur mono-variable

**Principe :** L'utilisateur sélectionne :
1. Un paramètre à varier (ex: R2 d'une lentille, épaisseur, espacement)
2. Une plage de recherche [min, max]
3. Une métrique à minimiser (RMS spot size, aberration chromatique)

L'optimiseur fait un balayage puis un affinement par section dorée (golden section search) pour trouver le minimum.

```typescript
interface OptimizationConfig {
  parameter: {
    elementId: string;
    property: string;        // 'radius1' | 'radius2' | 'thickness' | 'spacing' | ...
  };
  range: [number, number];
  metric: 'rms_spot' | 'chromatic_longitudinal' | 'max_ray_error';
  samples: number;           // Points pour le balayage initial
}

interface OptimizationResult {
  bestValue: number;
  bestMetric: number;
  curve: { value: number; metric: number }[];  // Pour affichage
}
```

**Affichage :** Graphe de la métrique en fonction du paramètre, avec le minimum marqué.

### Coating simple

**Couche quart d'onde (single-layer AR) :**
```
R_coated(λ) = ((n₁n₃ - n₂²)/(n₁n₃ + n₂²))²
Épaisseur optimale : d = λ₀/(4n₂)
n₂ = √(n₁×n₃) pour R = 0 à λ₀
```

Où n₂ est l'indice de la couche, n₁ et n₃ les milieux de part et d'autre.

```typescript
interface Coating {
  type: 'none' | 'quarter_wave' | 'custom';
  coatingIndex?: number;     // n₂ du film
  designWavelength?: number; // λ₀ en nm
}
```

Applicable à chaque surface individuellement. Modifie les coefficients de Fresnel effectifs.

### Checklist Phase 7D

- [ ] Génération du tableau de prescription
- [ ] Export CSV + copie presse-papier
- [ ] Import par collage d'une prescription
- [ ] Optimiseur mono-variable (balayage + section dorée)
- [ ] Affichage graphe métrique(paramètre)
- [ ] Coating quart d'onde sur les surfaces
- [ ] Modification des coefficients de Fresnel avec coating
- [ ] Tests : coating idéal (n₂ = √(n₁n₃)) → R = 0 à λ₀
- [ ] Tests : optimiseur trouve le minimum connu d'un cas simple

---

## Physique supplémentaire

### Formule de Sellmeier
```
n²(λ) = 1 + B₁λ²/(λ²-C₁) + B₂λ²/(λ²-C₂) + B₃λ²/(λ²-C₃)
λ en µm
```

### Nombre d'Abbe
```
νD = (nD - 1) / (nF - nC)
nD = n(589.3nm), nF = n(486.1nm), nC = n(656.3nm)

Grand νD (>50) = crown = faible dispersion
Petit νD (<50) = flint = forte dispersion
```

### Couche quart d'onde
```
R(λ) = ((n₁n₃ - n₂²)/(n₁n₃ + n₂²))²
À λ = λ₀ et n₂ = √(n₁n₃) : R = 0
```

### Section dorée (optimisation)
```
φ = (1 + √5) / 2 ≈ 1.618
À chaque itération, l'intervalle est réduit d'un facteur 1/φ.
Convergence : ε atteint en O(log(1/ε)) évaluations.
```

### Grandissement transverse
```
γ = -n₁·u'/(n₂·u) (formule exacte par tracé)
γ = -v/u (lentille mince)
```

### Ouverture numérique
```
NA = n × sin(θ_max)
f/N = f / D_pupille_entrée
```

---

## Priorité et dépendances

```
Phase 7A (Unités + Catalogue)
    ↓
Phase 7B (Spot diagram + Métriques)
    ↓
Phase 7C (Objet/Image + Diaphragme)
    ↓
Phase 7D (Prescription + Optimiseur + Coating)
```

Chaque sous-phase dépend de la précédente. La 7A est fondamentale car toutes les métriques quantitatives nécessitent des unités physiques.

---

## Conventions supplémentaires

- **Distances** : en millimètres dans le moteur, converties en pixels pour l'affichage
- **Prescription** : convention de signe optique standard (R > 0 si centre de courbure à droite)
- **Champ** : en degrés dans l'UI, en radians dans le moteur
- **Spot size** : en µm (typiquement entre 1 et 1000 µm)
- **f/N** : sans unité, affiché avec une décimale (ex: f/2.8)
