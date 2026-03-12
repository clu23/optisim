import type { Vec2, Ray, HitResult, OpticalSurface, OpticalElement, BoundingBox } from '../types.ts'
import { intersectRayCircle, type ArcConstraint } from '../intersection.ts'
import { add, scale, rotate, sub, normalize } from '../vector.ts'

// ─────────────────────────────────────────────────────────────────────────────
// CurvedMirrorSurface
//
// Arc de cercle réfléchissant défini par :
//   - center  : centre de courbure
//   - radius  : rayon de courbure R
//   - arc     : contrainte angulaire (angle central + demi-ouverture)
//
// La normale retournée par intersect est orientée vers le rayon incident
// (garantie par intersectRayCircle). getNormal retourne la normale sortante
// du cercle (usage externe : rendu, débogage).
// ─────────────────────────────────────────────────────────────────────────────

class CurvedMirrorSurface implements OpticalSurface {
  readonly id: string
  private readonly center: Vec2
  private readonly radius: number
  private readonly arc: ArcConstraint

  constructor(id: string, center: Vec2, radius: number, arc: ArcConstraint) {
    this.id = id
    this.center = center
    this.radius = radius
    this.arc = arc
  }

  intersect(ray: Ray): HitResult | null {
    const raw = intersectRayCircle(ray, this.center, this.radius, this.arc)
    if (raw === null) return null
    return { point: raw.point, normal: raw.normal, t: raw.t, surfaceId: this.id }
  }

  getNormal(point: Vec2): Vec2 {
    // Normale sortante du cercle (de center vers point)
    return normalize(sub(point, this.center))
  }

  // Miroir pur : pas d'interface réfringente
  getRefractiveIndex(_wavelength: number): number {
    return 1
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CurvedMirror — OpticalElement
//
// Miroir sphérique concave ou convexe.
//
// Convention géométrique :
//   - `position`  : sommet du miroir (apex de l'arc)
//   - `angle`     : direction de l'axe optique en radians (vers la lumière
//                   incidente). angle=0 → miroir face au +x.
//   - `radius`    : rayon de courbure R > 0
//   - `aperture`  : demi-ouverture angulaire de l'arc (radians)
//   - `concave`   : true (défaut) = concave, false = convexe
//
// Foyer paraxial :
//   - Concave : f = R/2, en avant du sommet (côté source)
//   - Convexe : f = -R/2 (foyer virtuel, derrière le miroir)
// ─────────────────────────────────────────────────────────────────────────────

export interface CurvedMirrorParams {
  id: string
  position: Vec2
  /** Direction de l'axe optique (radians). 0 = miroir face au +x. */
  angle: number
  /** Rayon de courbure R > 0. */
  radius: number
  /** Demi-ouverture angulaire de l'arc (radians). */
  aperture: number
  /** true = concave (défaut), false = convexe. */
  concave?: boolean
  label?: string
}

export class CurvedMirror implements OpticalElement {
  readonly id: string
  readonly type = 'curved-mirror'
  position: Vec2
  angle: number
  radius: number
  aperture: number
  concave: boolean
  label: string

  constructor({ id, position, angle, radius, aperture, concave = true, label }: CurvedMirrorParams) {
    this.id = id
    this.position = position
    this.angle = angle
    this.radius = radius
    this.aperture = aperture
    this.concave = concave
    this.label = label ?? (concave ? 'Miroir concave' : 'Miroir convexe')
  }

  /**
   * Centre de courbure.
   * Concave : en avant du sommet (côté lumière incidente), à distance R.
   * Convexe : derrière le sommet, à distance R.
   */
  private curvatureCenter(): Vec2 {
    const axisDir = rotate({ x: 1, y: 0 }, this.angle)
    // Concave : C = V + R·axisDir  |  Convexe : C = V − R·axisDir
    const sign = this.concave ? 1 : -1
    return add(this.position, scale(axisDir, sign * this.radius))
  }

  /**
   * Angle de l'arc (direction de C vers le sommet).
   * Concave : axisDir est de V vers C → direction de C vers V = angle + π
   * Convexe : C est derrière V → direction de C vers V = angle
   */
  private arcCenterAngle(): number {
    return this.concave ? this.angle + Math.PI : this.angle
  }

  getSurfaces(): OpticalSurface[] {
    const C = this.curvatureCenter()
    const arc: ArcConstraint = {
      center: this.arcCenterAngle(),
      halfAngle: this.aperture,
    }
    return [new CurvedMirrorSurface(`${this.id}-surface`, C, this.radius, arc)]
  }

  getBoundingBox(): BoundingBox {
    const C = this.curvatureCenter()
    const arcCenter = this.arcCenterAngle()

    // Échantillonne l'arc en 3 points : sommet + deux extrémités
    const pts: Vec2[] = [
      this.position,
      {
        x: C.x + this.radius * Math.cos(arcCenter + this.aperture),
        y: C.y + this.radius * Math.sin(arcCenter + this.aperture),
      },
      {
        x: C.x + this.radius * Math.cos(arcCenter - this.aperture),
        y: C.y + this.radius * Math.sin(arcCenter - this.aperture),
      },
    ]

    const MARGIN = 2
    return {
      min: { x: Math.min(...pts.map(p => p.x)) - MARGIN, y: Math.min(...pts.map(p => p.y)) - MARGIN },
      max: { x: Math.max(...pts.map(p => p.x)) + MARGIN, y: Math.max(...pts.map(p => p.y)) + MARGIN },
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
