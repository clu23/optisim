import type { Vec2, OpticalSurface, OpticalElement, BoundingBox } from '../types.ts'
import { ConicSurface } from '../surfaces/conic.ts'
import { add, scale, rotate } from '../vector.ts'
import { materialIndex, type MaterialId } from '../dispersion.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Sagitta — profondeur axiale d'une surface conique à hauteur r
//
//   sag(r, R, κ) = r² / (R · (1 + √(1 − (1+κ)·r²/R²)))
//
// Retourne 0 si r = 0, Infinity si r dépasse l'ouverture maximale (discriminant < 0).
// ─────────────────────────────────────────────────────────────────────────────

export function sagitta(r: number, R: number, kappa: number): number {
  if (r === 0) return 0
  const arg = 1 - (1 + kappa) * (r * r) / (R * R)
  if (arg < 0) return Infinity  // hors de l'ouverture physique de la conique
  return (r * r) / (R * (1 + Math.sqrt(arg)))
}

// ─────────────────────────────────────────────────────────────────────────────
// ThickLens — Lentille épaisse à deux surfaces coniques
//
// Convention des paramètres (sign invariante, intuitive) :
//
//   R1 > 0  →  face avant CONVEXE vers le rayon incident
//              (centre de courbure du côté de la transmission = à droite si angle=0)
//   R2 > 0  →  face arrière CONVEXE vers le rayon sortant
//              (centre de courbure à GAUCHE = à l'intérieur du verre)
//
// Cela signifie qu'une lentille biconvexe standard a R1 > 0 ET R2 > 0.
//
// Correspondance avec la convention optique standard (Hecht/Born&Wolf) :
//   R1_std = +R1      (inchangé)
//   R2_std = -R2      (signe inversé)
//
// Équation du fabricant (approche mince, λ nominal) :
//   1/f ≈ (n−1)·[1/R1 + 1/R2 − (n−1)·t/(n·R1·R2)]
//
// Le traceur réfracte indépendamment sur S1 puis S2 (Snell-Descartes exact).
// ─────────────────────────────────────────────────────────────────────────────

export interface ThickLensParams {
  id: string
  position: Vec2
  /** Direction de l'axe optique (radians). 0 = axe +x, lumière venant de la gauche. */
  angle: number
  /** Rayon de courbure de la face avant (> 0 = convexe). */
  R1: number
  /** Rayon de courbure de la face arrière (> 0 = convexe). */
  R2: number
  /** Constante de conicité de la face avant (0 = sphérique). */
  kappa1?: number
  /** Constante de conicité de la face arrière (0 = sphérique). */
  kappa2?: number
  /** Épaisseur au centre (distance inter-vertex, pixels). */
  thickness: number
  /** Demi-ouverture physique (pixels). */
  halfHeight: number
  /** Indice de réfraction fixe (utilisé si material absent). */
  n: number
  /**
   * Matériau du catalogue (Cauchy) — optionnel.
   * Si présent, n(λ) est calculé par dispersion de Cauchy.
   */
  material?: MaterialId
  label?: string
}

export class ThickLens implements OpticalElement {
  readonly id: string
  readonly type = 'thick-lens'
  position: Vec2
  angle: number
  R1: number
  R2: number
  kappa1: number
  kappa2: number
  thickness: number
  halfHeight: number
  n: number
  material: MaterialId | undefined
  label: string

  constructor(p: ThickLensParams) {
    this.id         = p.id
    this.position   = p.position
    this.angle      = p.angle
    this.R1         = p.R1
    this.R2         = p.R2
    this.kappa1     = p.kappa1 ?? 0
    this.kappa2     = p.kappa2 ?? 0
    this.thickness  = p.thickness
    this.halfHeight = p.halfHeight
    this.n          = p.n
    this.material   = p.material
    this.label      = p.label ?? 'Lentille épaisse'
  }

  /** Vecteur unitaire de l'axe optique. */
  axisDirection(): Vec2 {
    return rotate({ x: 1, y: 0 }, this.angle)
  }

  /** Indice de réfraction à la longueur d'onde donnée (Cauchy ou fixe). */
  indexAt(wavelengthNm: number): number {
    return this.material ? materialIndex(this.material, wavelengthNm) : this.n
  }

  // ── Positions des sommets des deux surfaces ──────────────────────────────

  /** Sommet de la face avant S1 = center − (thickness/2)·axisDir */
  vertex1(): Vec2 {
    return add(this.position, scale(this.axisDirection(), -this.thickness / 2))
  }

  /** Sommet de la face arrière S2 = center + (thickness/2)·axisDir */
  vertex2(): Vec2 {
    return add(this.position, scale(this.axisDirection(), this.thickness / 2))
  }

  // ── Foyer paraxial (lensmaker, approximation mince) ──────────────────────

  /**
   * Longueur focale paraxiale (approximation lensmaker au 1er ordre).
   * Valide pour le régime paraxial et les lentilles minces.
   *
   * Convention : 1/f = (n−1)·[1/R1 + 1/R2 − (n−1)·t/(n·R1·R2)]
   */
  paraxialFocalLength(wavelengthNm = 550): number {
    const nv = this.indexAt(wavelengthNm)
    const t  = this.thickness
    return 1 / ((nv - 1) * (1 / this.R1 + 1 / this.R2 - (nv - 1) * t / (nv * this.R1 * this.R2)))
  }

  // ── OpticalElement ───────────────────────────────────────────────────────

  getSurfaces(): OpticalSurface[] {
    const fn = (wl: number) => this.indexAt(wl)

    // S1 — face avant, convexe vers la gauche (côté source)
    //   axisAngle = angle : l'axe local +x pointe VERS LA DROITE (= direction de propagation)
    //   La conique ouvre vers +x_local = vers l'intérieur du verre
    const s1 = new ConicSurface({
      id:         `${this.id}-s1`,
      vertex:     this.vertex1(),
      axisAngle:  this.angle,
      R:          this.R1,
      kappa:      this.kappa1,
      halfHeight: this.halfHeight,
      indexFn:    fn,
    })

    // S2 — face arrière, convexe vers la droite (côté sortant)
    //   axisAngle = angle + π : l'axe local +x pointe VERS LA GAUCHE
    //   La conique ouvre vers +x_local = vers l'intérieur du verre
    const s2 = new ConicSurface({
      id:         `${this.id}-s2`,
      vertex:     this.vertex2(),
      axisAngle:  this.angle + Math.PI,
      R:          this.R2,
      kappa:      this.kappa2,
      halfHeight: this.halfHeight,
      indexFn:    fn,
    })

    return [s1, s2]
  }

  // ── containsPoint — intérieur du volume de verre ─────────────────────────
  //
  // Repère local (center=origine, axe=+x) :
  //   frontBoundary(r) = −thickness/2 + sag(r, R1, κ1)
  //   backBoundary(r)  = +thickness/2 − sag(r, R2, κ2)
  //
  // Un point est dans le verre si :
  //   |y_local| ≤ halfHeight
  //   frontBoundary ≤ x_local ≤ backBoundary
  // ─────────────────────────────────────────────────────────────────────────

  containsPoint(point: Vec2): boolean {
    // Transformation dans le repère local de la lentille (centre=origine, axe=+x)
    const cos  = Math.cos(this.angle)
    const sin  = Math.sin(this.angle)
    const dx   = point.x - this.position.x
    const dy   = point.y - this.position.y
    const xLoc = dx * cos + dy * sin
    const yLoc = -dx * sin + dy * cos

    const r    = Math.abs(yLoc)
    if (r > this.halfHeight) return false

    const half  = this.thickness / 2
    const front = -half + sagitta(r, this.R1, this.kappa1)
    const back  = +half - sagitta(r, this.R2, this.kappa2)

    return xLoc >= front && xLoc <= back
  }

  getBoundingBox(): BoundingBox {
    const ax   = this.axisDirection()
    const perp: Vec2 = { x: -ax.y, y: ax.x }

    // Sagitta maximale (au bord de l'ouverture)
    const s1max = sagitta(this.halfHeight, this.R1, this.kappa1)
    const s2max = sagitta(this.halfHeight, this.R2, this.kappa2)

    // Profondeur axiale totale : de la face avant à la face arrière (y compris le sag)
    const frontOffset = -(this.thickness / 2) + Math.min(0, -s1max)
    const backOffset  = +(this.thickness / 2) + Math.max(0,  s2max)

    // Coins extrêmes en repère monde
    const corners: Vec2[] = [
      add(this.position, add(scale(ax, frontOffset), scale(perp,  this.halfHeight))),
      add(this.position, add(scale(ax, frontOffset), scale(perp, -this.halfHeight))),
      add(this.position, add(scale(ax,  backOffset), scale(perp,  this.halfHeight))),
      add(this.position, add(scale(ax,  backOffset), scale(perp, -this.halfHeight))),
    ]

    const MARGIN = 4
    return {
      min: { x: Math.min(...corners.map(c => c.x)) - MARGIN, y: Math.min(...corners.map(c => c.y)) - MARGIN },
      max: { x: Math.max(...corners.map(c => c.x)) + MARGIN, y: Math.max(...corners.map(c => c.y)) + MARGIN },
    }
  }
}
