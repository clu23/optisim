import type { Vec2, Ray, HitResult, OpticalSurface, OpticalElement, BoundingBox } from '../types.ts'
import { intersectRaySegment } from '../intersection.ts'
import { rotate } from '../vector.ts'

// ─────────────────────────────────────────────────────────────────────────────
// ApertureElement — diaphragme physique (Phase 7C)
//
// Bloque les rayons en dehors de l'ouverture nette (clearRadius).
// Modèle géométrique : deux segments opaques (ailes) de part et d'autre
// de l'ouverture nette.  Le traceur termine immédiatement tout rayon qui
// touche une aile (duck-typing via `type === 'aperture'`).
//
// ┌──── diameter/2 ────┐
// ├──── clearRadius ───┤  ← bord de l'ouverture
//         ↑ clair
//         ↓ clair
// ├──── clearRadius ───┤
// └──── diameter/2 ────┘
//
// Conventions d'angle (même que les autres éléments) :
//   angle = 0  → plan du diaphragme vertical, axe optique selon +x
//   axisDir = rotate({1,0}, angle)
//   planeDir = rotate({0,1}, angle)  (direction le long du diaphragme)
// ─────────────────────────────────────────────────────────────────────────────

export interface ApertureParams {
  id:           string
  position:     Vec2
  /** Direction de l'axe optique (radians). 0 = axe +x. */
  angle:        number
  /** Diamètre total du diaphragme (px). */
  diameter:     number
  /** Demi-ouverture nette (px). Les rayons passent si |h| ≤ clearRadius. */
  clearRadius:  number
  label?:       string
}

// ─────────────────────────────────────────────────────────────────────────────
// ApertureWingSurface — surface opaque d'une aile du diaphragme
// ─────────────────────────────────────────────────────────────────────────────

class ApertureWingSurface implements OpticalSurface {
  readonly id: string
  private readonly a: Vec2
  private readonly b: Vec2

  constructor(id: string, a: Vec2, b: Vec2) {
    this.id = id
    this.a  = a
    this.b  = b
  }

  intersect(ray: Ray): HitResult | null {
    const raw = intersectRaySegment(ray, this.a, this.b)
    if (raw === null) return null
    return { point: raw.point, normal: raw.normal, t: raw.t, surfaceId: this.id }
  }

  getNormal(_p: Vec2): Vec2 { return { x: 1, y: 0 } }  // non utilisé (absorbant)

  getRefractiveIndex(_wl: number): number { return 1 }
}

// ─────────────────────────────────────────────────────────────────────────────
// ApertureElement
// ─────────────────────────────────────────────────────────────────────────────

export class ApertureElement implements OpticalElement {
  readonly type = 'aperture' as const
  /** Duck-typing utilisé par le traceur pour terminer les rayons absorbés. */
  readonly isApertureStop = true

  readonly id:  string
  position:     Vec2
  angle:        number
  diameter:     number
  clearRadius:  number
  label:        string

  constructor(p: ApertureParams) {
    this.id          = p.id
    this.position    = { ...p.position }
    this.angle       = p.angle
    this.diameter    = p.diameter
    this.clearRadius = Math.min(p.clearRadius, p.diameter / 2)
    this.label       = p.label ?? 'Diaphragme'
  }

  /** Direction de l'axe optique (perpendiculaire au plan du diaphragme). */
  get axisDir(): Vec2 { return rotate({ x: 1, y: 0 }, this.angle) }

  /** Direction dans le plan du diaphragme (tangente). */
  get planeDir(): Vec2 { return rotate({ x: 0, y: 1 }, this.angle) }

  /** Extrémités du diaphragme dans le repère monde. */
  endpoints(): [Vec2, Vec2] {
    const pd = this.planeDir
    const r  = this.diameter / 2
    return [
      { x: this.position.x - r * pd.x, y: this.position.y - r * pd.y },
      { x: this.position.x + r * pd.x, y: this.position.y + r * pd.y },
    ]
  }

  /**
   * Deux surfaces opaques (ailes) autour de l'ouverture nette.
   * Aile haute : de +clearRadius à +diameter/2 le long de planeDir.
   * Aile basse : de -diameter/2 à -clearRadius le long de planeDir.
   */
  getSurfaces(): OpticalSurface[] {
    const pd = this.planeDir
    const pos = this.position
    const r   = this.diameter / 2
    const cr  = this.clearRadius

    const topA: Vec2 = { x: pos.x + cr * pd.x,  y: pos.y + cr * pd.y }
    const topB: Vec2 = { x: pos.x + r  * pd.x,  y: pos.y + r  * pd.y }
    const botA: Vec2 = { x: pos.x - cr * pd.x,  y: pos.y - cr * pd.y }
    const botB: Vec2 = { x: pos.x - r  * pd.x,  y: pos.y - r  * pd.y }

    return [
      new ApertureWingSurface(`${this.id}-top`, topA, topB),
      new ApertureWingSurface(`${this.id}-bot`, botB, botA),
    ]
  }

  getBoundingBox(): BoundingBox {
    const [a, b] = this.endpoints()
    const MARGIN = 8
    return {
      min: { x: Math.min(a.x, b.x) - MARGIN, y: Math.min(a.y, b.y) - MARGIN },
      max: { x: Math.max(a.x, b.x) + MARGIN, y: Math.max(a.y, b.y) + MARGIN },
    }
  }

  containsPoint(_p: Vec2): boolean { return false }
}
