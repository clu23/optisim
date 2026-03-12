import type { Vec2, Ray, HitResult, OpticalSurface, OpticalElement, BoundingBox } from '../types.ts'
import { intersectRaySegment } from '../intersection.ts'
import { add, normalize, sub } from '../vector.ts'

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
  private readonly n: number

  constructor(id: string, a: Vec2, b: Vec2, n: number) {
    this.id = id
    this.a = a
    this.b = b
    this.n = n
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

  getRefractiveIndex(_wavelength: number): number {
    return this.n
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
  /** Longueur d'un côté en pixels. */
  size: number
  /** Indice de réfraction du matériau (n > 1). */
  n: number
  label?: string
}

export class Prism implements OpticalElement {
  readonly id: string
  readonly type = 'prism'
  position: Vec2
  angle: number
  size: number
  n: number
  label: string

  constructor({ id, position, angle, size, n, label }: PrismParams) {
    this.id = id
    this.position = position
    this.angle = angle
    this.size = size
    this.n = n
    this.label = label ?? 'Prisme'
  }

  /** Rayon du cercle circonscrit : R = size / √3. */
  circumradius(): number {
    return this.size / Math.sqrt(3)
  }

  /**
   * Calcule les 3 sommets dans le repère monde, ordonnés CCW.
   *   [0] = apex, [1] = bas-gauche, [2] = bas-droite  (pour angle = 0)
   */
  vertices(): [Vec2, Vec2, Vec2] {
    const R = this.circumradius()
    // Angle de base : apex pointe vers +y (π/2), puis rotation par this.angle
    const base = Math.PI / 2 + this.angle
    return [0, 1, 2].map(k =>
      add(this.position, {
        x: R * Math.cos(base + k * (2 * Math.PI / 3)),
        y: R * Math.sin(base + k * (2 * Math.PI / 3)),
      })
    ) as [Vec2, Vec2, Vec2]
  }

  getSurfaces(): OpticalSurface[] {
    const [v0, v1, v2] = this.vertices()
    return [
      new PrismSurface(`${this.id}-s0`, v0, v1, this.n),  // face gauche
      new PrismSurface(`${this.id}-s1`, v1, v2, this.n),  // base
      new PrismSurface(`${this.id}-s2`, v2, v0, this.n),  // face droite
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
