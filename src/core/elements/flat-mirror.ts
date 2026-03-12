import type { Vec2, Ray, HitResult, OpticalSurface, OpticalElement, BoundingBox } from '../types.ts'
import { intersectRaySegment } from '../intersection.ts'
import { add, rotate, normalize, sub } from '../vector.ts'

// ─────────────────────────────────────────────────────────────────────────────
// FlatMirrorSurface
//
// Surface réfléchissante définie par ses deux extrémités A et B.
// L'intersection utilise intersectRaySegment ; getRefractiveIndex retourne 1
// car un miroir ne transmet pas la lumière.
// ─────────────────────────────────────────────────────────────────────────────

class FlatMirrorSurface implements OpticalSurface {
  readonly id: string
  private readonly a: Vec2
  private readonly b: Vec2

  constructor(id: string, a: Vec2, b: Vec2) {
    this.id = id
    this.a = a
    this.b = b
  }

  intersect(ray: Ray): HitResult | null {
    const raw = intersectRaySegment(ray, this.a, this.b)
    if (raw === null) return null
    return { point: raw.point, normal: raw.normal, t: raw.t, surfaceId: this.id }
  }

  getNormal(_point: Vec2): Vec2 {
    // Normale perpendiculaire au segment (b − a), orientée vers le "dessus" du miroir
    // Sens : rotation +90° du vecteur directeur du segment
    const s = sub(this.b, this.a)
    return normalize({ x: -s.y, y: s.x })
  }

  // Les miroirs ne sont pas des interfaces réfringentes — retourne 1 par convention
  getRefractiveIndex(_wavelength: number): number {
    return 1
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FlatMirror — OpticalElement
//
// Miroir plan centré en `position`, orienté selon `angle` (radians),
// de longueur totale `length` (px).
// ─────────────────────────────────────────────────────────────────────────────

export interface FlatMirrorParams {
  id: string
  position: Vec2
  /** Orientation du miroir en radians (dans core). 0 = horizontal. */
  angle: number
  /** Longueur totale du miroir en pixels. */
  length: number
  label?: string
}

export class FlatMirror implements OpticalElement {
  readonly id: string
  readonly type = 'flat-mirror'
  position: Vec2
  angle: number
  length: number
  label: string

  constructor({ id, position, angle, length, label }: FlatMirrorParams) {
    this.id = id
    this.position = position
    this.angle = angle
    this.length = length
    this.label = label ?? 'Miroir plan'
  }

  /** Extrémités du segment miroir dans le repère monde. */
  private endpoints(): [Vec2, Vec2] {
    const half = this.length / 2
    // Vecteur directeur du miroir selon son orientation
    const along = rotate({ x: 1, y: 0 }, this.angle)
    const a = add(this.position, { x: -half * along.x, y: -half * along.y })
    const b = add(this.position, { x:  half * along.x, y:  half * along.y })
    return [a, b]
  }

  getSurfaces(): OpticalSurface[] {
    const [a, b] = this.endpoints()
    return [new FlatMirrorSurface(`${this.id}-surface`, a, b)]
  }

  getBoundingBox(): BoundingBox {
    const [a, b] = this.endpoints()
    const MARGIN = 2
    return {
      min: { x: Math.min(a.x, b.x) - MARGIN, y: Math.min(a.y, b.y) - MARGIN },
      max: { x: Math.max(a.x, b.x) + MARGIN, y: Math.max(a.y, b.y) + MARGIN },
    }
  }

  containsPoint(point: Vec2): boolean {
    const bb = this.getBoundingBox()
    return (
      point.x >= bb.min.x && point.x <= bb.max.x &&
      point.y >= bb.min.y && point.y <= bb.max.y
    )
  }
}
