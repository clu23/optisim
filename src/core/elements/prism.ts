import type { Vec2, Ray, HitResult, OpticalSurface, OpticalElement, BoundingBox } from '../types.ts'
import { intersectRaySegment } from '../intersection.ts'
import { add, normalize, sub } from '../vector.ts'
import { materialIndex, type MaterialId } from '../dispersion.ts'

// ─────────────────────────────────────────────────────────────────────────────
// PrismSurface — interface réfractante (segment)
//
// Chaque côté du prisme est une interface entre le matériau (indice n) et
// l'extérieur (air, indice 1). getRefractiveIndex retourne l'indice du
// matériau ; c'est au traceur de déterminer n₁ et n₂ via containsPoint
// sur le Prism parent.
// ─────────────────────────────────────────────────────────────────────────────

class PrismSurface implements OpticalSurface {
  readonly id: string
  private readonly a: Vec2
  private readonly b: Vec2
  private readonly indexFn: (wavelengthNm: number) => number

  constructor(id: string, a: Vec2, b: Vec2, indexFn: (wavelengthNm: number) => number) {
    this.id = id
    this.a = a
    this.b = b
    this.indexFn = indexFn
  }

  intersect(ray: Ray): HitResult | null {
    const raw = intersectRaySegment(ray, this.a, this.b)
    if (raw === null) return null
    return { point: raw.point, normal: raw.normal, t: raw.t, surfaceId: this.id }
  }

  getNormal(_point: Vec2): Vec2 {
    // Normale sortante pour un polygone CCW :
    // Rotation de −90° du vecteur directeur de l'arête s = B−A → (s.y, −s.x)
    const s = sub(this.b, this.a)
    return normalize({ x: s.y, y: -s.x })
  }

  // Loi de Cauchy si matériau, indice fixe sinon
  getRefractiveIndex(wavelength: number): number {
    return this.indexFn(wavelength)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Prisme triangulaire équilatéral — OpticalElement
//
// Paramètres :
//   position  : centroïde du prisme (pixels)
//   angle     : rotation en radians (0 = apex vers +y)
//   size      : longueur d'un côté (pixels)
//   n         : indice de réfraction (Phase 1 : valeur unique ; Cauchy Phase 2)
//
// Géométrie (angle = 0, repère local centré au centroïde) :
//   R_circ = size / √3   (rayon du cercle circonscrit)
//   V0 = apex haut       : (0,  R_circ)               ← angle π/2
//   V1 = bas-gauche      : (−R_circ·√3/2, −R_circ/2)  ← angle 7π/6
//   V2 = bas-droite      : (+R_circ·√3/2, −R_circ/2)  ← angle 11π/6
//
// Les sommets sont dans le sens trigonométrique (CCW).
// Surfaces (CCW → normale sortante = rotation −90° du vecteur d'arête) :
//   S0 : V0→V1  (face gauche)
//   S1 : V1→V2  (base)
//   S2 : V2→V0  (face droite)
//
// containsPoint : algorithme crossing (lancer de rayon horizontal).
// ─────────────────────────────────────────────────────────────────────────────

export interface PrismParams {
  id: string
  position: Vec2
  /** Rotation du prisme en radians. 0 = apex vers +y. */
  angle: number
  /** Longueur des deux côtés égaux (jambes) en pixels. */
  size: number
  /**
   * Angle au sommet (apex) en radians. Défaut : π/3 (60° → prisme équilatéral).
   * Les deux jambes partant de l'apex ont la même longueur (= size).
   * La base est calculée : base = 2·size·sin(apexAngle/2).
   */
  apexAngle?: number
  /** Indice de réfraction fixe (utilisé si material est absent). */
  n: number
  /**
   * Matériau du catalogue (optionnel). Si présent, remplace n par la loi de
   * Cauchy : n(λ) varie avec la longueur d'onde → dispersion chromatique.
   */
  material?: MaterialId
  label?: string
}

export class Prism implements OpticalElement {
  readonly id: string
  readonly type = 'prism'
  position: Vec2
  angle: number
  size: number
  apexAngle: number
  n: number
  material: MaterialId | undefined
  label: string

  constructor({ id, position, angle, size, apexAngle, n, material, label }: PrismParams) {
    this.id = id
    this.position = position
    this.angle = angle
    this.size = size
    this.apexAngle = apexAngle ?? Math.PI / 3
    this.n = n
    this.material = material
    this.label = label ?? 'Prisme'
  }

  /**
   * Rayon du cercle circonscrit.
   * Pour un triangle isocèle avec jambe L et angle au sommet α :
   *   R = L / (2·cos(α/2))
   * Cas équilatéral (α=60°) : R = L / (2·cos(30°)) = L / √3. ✓
   */
  circumradius(): number {
    return this.size / (2 * Math.cos(this.apexAngle / 2))
  }

  /**
   * Calcule les 3 sommets dans le repère monde, ordonnés CCW.
   *   [0] = apex, [1] = bas-gauche, [2] = bas-droite  (pour angle = 0)
   *
   * Géométrie locale (triangle isocèle, apex vers +y) :
   *   h    = size·cos(apexAngle/2)   — hauteur totale
   *   b/2  = size·sin(apexAngle/2)   — demi-base
   *   centroïde à h/3 de la base = 2h/3 de l'apex
   *
   *   V0 = (0,              +2h/3)   ← apex
   *   V1 = (−size·sin(α/2), −h/3)   ← bas-gauche
   *   V2 = (+size·sin(α/2), −h/3)   ← bas-droite
   */
  vertices(): [Vec2, Vec2, Vec2] {
    const alpha = this.apexAngle
    const L = this.size
    const h  = L * Math.cos(alpha / 2)
    const b2 = L * Math.sin(alpha / 2)

    // Coordonnées locales (apex vers +y, centroïde à l'origine)
    const local: [Vec2, Vec2, Vec2] = [
      { x:  0,  y:  2 * h / 3 },
      { x: -b2, y: -h / 3 },
      { x:  b2, y: -h / 3 },
    ]

    // Rotation par this.angle puis translation vers this.position
    const cosA = Math.cos(this.angle)
    const sinA = Math.sin(this.angle)
    return local.map(v => add(this.position, {
      x: v.x * cosA - v.y * sinA,
      y: v.x * sinA + v.y * cosA,
    })) as [Vec2, Vec2, Vec2]
  }

  /** Retourne l'indice à la longueur d'onde donnée (Cauchy ou fixe). */
  indexAt(wavelengthNm: number): number {
    return this.material ? materialIndex(this.material, wavelengthNm) : this.n
  }

  getSurfaces(): OpticalSurface[] {
    const [v0, v1, v2] = this.vertices()
    const fn = (wl: number) => this.indexAt(wl)
    return [
      new PrismSurface(`${this.id}-s0`, v0, v1, fn),  // face gauche
      new PrismSurface(`${this.id}-s1`, v1, v2, fn),  // base
      new PrismSurface(`${this.id}-s2`, v2, v0, fn),  // face droite
    ]
  }

  getBoundingBox(): BoundingBox {
    const [v0, v1, v2] = this.vertices()
    const MARGIN = 2
    return {
      min: { x: Math.min(v0.x, v1.x, v2.x) - MARGIN, y: Math.min(v0.y, v1.y, v2.y) - MARGIN },
      max: { x: Math.max(v0.x, v1.x, v2.x) + MARGIN, y: Math.max(v0.y, v1.y, v2.y) + MARGIN },
    }
  }

  /**
   * Test point-dans-polygone par algorithme crossing (lancer de rayon horizontal).
   *
   * On lance un rayon vers +∞ depuis `point` et on compte les croisements
   * avec chaque arête. Nombre impair → intérieur.
   *
   * La condition stricte (vi.y > point.y) !== (vj.y > point.y) gère
   * correctement les arêtes horizontales et les sommets sur la ligne.
   */
  containsPoint(point: Vec2): boolean {
    const verts = this.vertices()
    let inside = false
    for (let i = 0, j = 2; i < 3; j = i++) {
      const vi = verts[i]
      const vj = verts[j]
      if ((vi.y > point.y) !== (vj.y > point.y)) {
        const xCross = vj.x + (point.y - vj.y) * (vi.x - vj.x) / (vi.y - vj.y)
        if (point.x < xCross) inside = !inside
      }
    }
    return inside
  }
}
