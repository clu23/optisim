import type { Vec2, OpticalSurface, OpticalElement, BoundingBox } from '../types.ts'
import { ConicSurface } from '../surfaces/conic.ts'
import { add, scale, rotate } from '../vector.ts'

// ─────────────────────────────────────────────────────────────────────────────
// ConicMirror — Miroir à surface conique
//
// Paramétré par :
//   - position  : sommet (apex) du miroir, repère monde
//   - angle     : direction de l'axe optique (radians).
//                 Convention identique à CurvedMirror :
//                 angle=0 → axe vers +x (miroir face aux rayons venant de +x).
//                 angle=π → axe vers −x (miroir face aux rayons venant de −x).
//   - R         : rayon de courbure au sommet (> 0)
//   - kappa     : constante de conicité (0=sphère, −1=parabole, …)
//   - halfHeight: demi-ouverture en pixels (aperture physique du miroir)
//
// Foyer paraxial (identique à CurvedMirror) :
//   F = vertex + (R/2) · axisDir
//
// Pour un miroir parabolique (κ=−1) :
//   Le foyer est exact (pas d'aberration sphérique) à F = vertex + (R/2)·axisDir.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConicMirrorParams {
  id: string
  position: Vec2
  /** Direction de l'axe optique (radians). 0 = face au +x. */
  angle: number
  /** Rayon de courbure au sommet (> 0). */
  R: number
  /** Constante de conicité κ. */
  kappa: number
  /** Demi-ouverture (aperture) du miroir en pixels. */
  halfHeight: number
  label?: string
}

export class ConicMirror implements OpticalElement {
  readonly id: string
  readonly type = 'conic-mirror'
  position: Vec2
  angle: number
  R: number
  kappa: number
  halfHeight: number
  label: string

  constructor({ id, position, angle, R, kappa, halfHeight, label }: ConicMirrorParams) {
    this.id         = id
    this.position   = position
    this.angle      = angle
    this.R          = R
    this.kappa      = kappa
    this.halfHeight = halfHeight
    this.label      = label ?? `Miroir conique (κ=${kappa})`
  }

  /** Vecteur unitaire de l'axe optique. */
  axisDirection(): Vec2 {
    return rotate({ x: 1, y: 0 }, this.angle)
  }

  /**
   * Foyer paraxial : F = vertex + (R/2)·axisDir.
   * Pour κ=−1 (parabole) ce foyer est exact, sans approximation paraxiale.
   */
  focalPoint(): Vec2 {
    return add(this.position, scale(this.axisDirection(), this.R / 2))
  }

  getSurfaces(): OpticalSurface[] {
    return [
      new ConicSurface({
        id:         `${this.id}-surface`,
        vertex:     this.position,
        axisAngle:  this.angle,
        R:          this.R,
        kappa:      this.kappa,
        halfHeight: this.halfHeight,
      }),
    ]
  }

  getBoundingBox(): BoundingBox {
    // Axe + vecteur perpendiculaire
    const ax  = this.axisDirection()
    const perp: Vec2 = { x: -ax.y, y: ax.x }

    // Profondeur de la conique à l'ouverture maximale (sagitta au bord)
    // z(h) = h² / (R(1 + √(1 − (1+κ)h²/R²)))
    // Approximation sûre : on borne par h²/(2R) + margin
    const h     = this.halfHeight
    const sagMax = h * h / (2 * this.R)
    const MARGIN = 4

    // Les quatre coins de la bounding box
    const apex   = this.position
    const axEnd  = add(this.position, scale(ax, sagMax))
    const topA   = add(apex, scale(perp,  h))
    const topB   = add(axEnd, scale(perp,  h))
    const botA   = add(apex, scale(perp, -h))
    const botB   = add(axEnd, scale(perp, -h))
    const pts    = [apex, axEnd, topA, topB, botA, botB]

    return {
      min: {
        x: Math.min(...pts.map(p => p.x)) - MARGIN,
        y: Math.min(...pts.map(p => p.y)) - MARGIN,
      },
      max: {
        x: Math.max(...pts.map(p => p.x)) + MARGIN,
        y: Math.max(...pts.map(p => p.y)) + MARGIN,
      },
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
