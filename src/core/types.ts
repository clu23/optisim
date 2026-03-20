// ============================================================
// OptiSim — Types et interfaces fondamentales
// Ce fichier ne dépend d'aucun autre module du projet.
// ============================================================

// === GÉOMÉTRIE ===

export interface Vec2 {
  x: number;
  y: number;
}

// === RAYONS ===

export interface Ray {
  origin: Vec2;
  direction: Vec2;       // Vecteur unitaire
  wavelength: number;    // nm (380–780)
  intensity: number;     // 0–1
  polarization?: 's' | 'p' | 'unpolarized';  // Phase 5
  opticalPath?: number;  // Chemin optique cumulé (phase 6)
}

export interface RaySegment {
  start: Vec2;
  end: Vec2;
  wavelength: number;
  intensity: number;
  curvePoints?: Vec2[];  // Points intermédiaires pour tracé courbe (phase 4)
}

export interface TraceResult {
  segments: RaySegment[];
  totalOpticalPath: number;
}

// === SURFACES ===

export interface HitResult {
  point: Vec2;        // Point d'intersection
  normal: Vec2;       // Normale orientée vers le rayon incident
  t: number;          // Paramètre le long du rayon (t > 0)
  surfaceId: string;  // Identifiant de la surface touchée
}

export interface OpticalSurface {
  id: string;
  intersect(ray: Ray): HitResult | null;
  getNormal(point: Vec2): Vec2;
  getRefractiveIndex(wavelength: number): number;
}

// === ÉLÉMENTS ===

export interface BoundingBox {
  min: Vec2;
  max: Vec2;
}

export interface OpticalElement {
  id: string;
  type: string;
  position: Vec2;
  angle: number;    // Degrés dans l'UI, radians dans core
  label: string;
  getSurfaces(): OpticalSurface[];
  getBoundingBox(): BoundingBox;
  containsPoint(point: Vec2): boolean;
}

// === SOURCES ===

export interface LightSource {
  id: string;
  type: 'point' | 'beam';
  position: Vec2;
  angle: number;          // Degrés
  wavelengths: number[];  // Liste de longueurs d'onde (nm)
  /** Polarisation initiale des rayons émis. Défaut : 'unpolarized'. */
  polarization: 's' | 'p' | 'unpolarized';
  generateRays(): Ray[];
}

// === SCÈNE ===

/**
 * Unités physiques de la scène (Phase 7A).
 * scale : millimètres par pixel à zoom=1.
 * Valeur par défaut : scale=1 (1 px = 1 mm, rétrocompatible avec les phases 1-6).
 */
export interface WorldUnits {
  scale: number;                      // mm/px à zoom=1
  displayUnit: 'mm' | 'µm' | 'cm';   // Unité affichée dans le panneau
}

export const DEFAULT_WORLD_UNITS: WorldUnits = { scale: 1, displayUnit: 'mm' }

export interface SceneMetadata {
  name: string;
  description?: string;
  units?: WorldUnits;  // Optionnel — absent dans les scènes legacy (phases 1-6)
}

export interface Scene {
  elements: OpticalElement[];
  sources: LightSource[];
  metadata: SceneMetadata;
}

// === MILIEU GRIN (phase 4) ===

export interface GRINMedium {
  refractiveIndexAt(position: Vec2, wavelength: number): number;
  gradientAt(position: Vec2, wavelength: number): Vec2;
  containsPoint(point: Vec2): boolean;
}

// === VALIDATION ===

export interface ValidationAssertion {
  description: string;
  check: (results: TraceResult[]) => boolean;
  tolerance: number;
}

export interface ValidationScene {
  id: string;
  description: string;
  scene: Scene;
  assertions: ValidationAssertion[];
}
