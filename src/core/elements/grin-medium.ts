import type { Vec2, OpticalElement, OpticalSurface, BoundingBox, GRINMedium } from '../types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// GRINElement — Milieu à gradient d'indice (GRIN)
//
// Implémente OpticalElement (pour s'intégrer dans Scene) ET GRINMedium
// (pour être reconnu par le traceur GRIN).
//
// Trois profils d'indice :
//   'linear'      n(y) = n0 + alpha·y           (gradient linéaire transverse)
//   'parabolic'   n(r) = n0·(1 − α²r²/2)        (fibre GRIN, r = dist. à l'axe)
//   'exponential' n(h) = 1 + (n0−1)·exp(−h/H)   (atmosphère / mirage, h = y)
//
// Convention axes :
//   L'axe "optique" est l'axe x (horizontal).
//   Pour 'linear' et 'parabolic', y est la coordonnée perpendiculaire.
//   Pour 'exponential', h = y (altitude).
//
// La région du milieu est un rectangle axis-aligned (boundingBox).
// Le traceur GRIN n'intègre que les segments à l'intérieur.
// ─────────────────────────────────────────────────────────────────────────────

export type GRINProfile = 'linear' | 'parabolic' | 'exponential'

export interface GRINMediumParams {
  id: string
  position: Vec2       // coin bas-gauche du rectangle
  width: number        // largeur (axe x)
  height: number       // hauteur (axe y)
  profile: GRINProfile
  /** Indice de base (au centre / à y=0). */
  n0: number
  /**
   * Coefficient de gradient :
   *   linear      : Δn par pixel (peut être négatif)
   *   parabolic   : α en px⁻¹  (n(r)=n0(1−α²r²/2), α>0)
   *   exponential : H en pixels (hauteur de scale)
   */
  alpha: number
  label?: string
  angle?: number  // toujours 0 pour GRIN (pas de rotation de la boîte)
}

// Gradient numérique — pas de différentiation ε
const GRAD_EPS = 0.5   // pixels

export class GRINElement implements OpticalElement, GRINMedium {
  readonly id: string
  readonly type = 'grin'
  position: Vec2
  angle: number
  label: string

  width: number
  height: number
  profile: GRINProfile
  n0: number
  alpha: number

  constructor(p: GRINMediumParams) {
    this.id       = p.id
    this.position = p.position
    this.angle    = p.angle ?? 0
    this.label    = p.label ?? `GRIN (${p.profile})`
    this.width    = p.width
    this.height   = p.height
    this.profile  = p.profile
    this.n0       = p.n0
    this.alpha    = p.alpha
  }

  // ── GRINMedium ─────────────────────────────────────────────────────────────

  /**
   * Indice de réfraction au point `pos`.
   * Note : wavelength ignoré pour l'instant (pas de dispersion Cauchy GRIN).
   */
  refractiveIndexAt(pos: Vec2, _wavelength: number): number {
    return this._n(pos)
  }

  /**
   * Gradient ∇n au point `pos` — différences finies centrées.
   * Utilisé par le RK4 : dp⃗/ds = ∇n.
   */
  gradientAt(pos: Vec2, _wavelength: number): Vec2 {
    const e = GRAD_EPS
    const nx = (this._n({ x: pos.x + e, y: pos.y }) - this._n({ x: pos.x - e, y: pos.y })) / (2 * e)
    const ny = (this._n({ x: pos.x, y: pos.y + e }) - this._n({ x: pos.x, y: pos.y - e })) / (2 * e)
    return { x: nx, y: ny }
  }

  containsPoint(pos: Vec2): boolean {
    return (
      pos.x >= this.position.x &&
      pos.x <= this.position.x + this.width &&
      pos.y >= this.position.y &&
      pos.y <= this.position.y + this.height
    )
  }

  // ── OpticalElement (interface mécanique) ───────────────────────────────────

  /** Un GRIN n'a pas de surface d'intersection — le traceur GRIN le gère directement. */
  getSurfaces(): OpticalSurface[] { return [] }

  getBoundingBox(): BoundingBox {
    return {
      min: { x: this.position.x,                 y: this.position.y },
      max: { x: this.position.x + this.width,     y: this.position.y + this.height },
    }
  }

  // ── Profils d'indice ───────────────────────────────────────────────────────

  private _n(pos: Vec2): number {
    switch (this.profile) {
      case 'linear': {
        // n(y) = n0 + α·y_local
        // y_local = y − centre_y du milieu
        const cy = this.position.y + this.height / 2
        return this.n0 + this.alpha * (pos.y - cy)
      }
      case 'parabolic': {
        // n(r) = n0·(1 − α²r²/2)
        // r = distance à l'axe optique = |y_local| (axe x passant par le centre)
        const cy = this.position.y + this.height / 2
        const r  = pos.y - cy   // coordonnée signée (r² est ce qui compte)
        return this.n0 * (1 - 0.5 * this.alpha * this.alpha * r * r)
      }
      case 'exponential': {
        // n(h) = 1 + (n0−1)·exp(−h/H)
        // h = altitude = y − bas du domaine (y_min = position.y)
        const h = pos.y - this.position.y
        return 1 + (this.n0 - 1) * Math.exp(-h / this.alpha)
      }
    }
  }

  // Expose _n comme méthode publique pour les tests
  indexAt(pos: Vec2): number { return this._n(pos) }
}
