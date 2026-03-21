import type { LightSource, Ray, Vec2 } from '../types.ts'
import { rotate } from '../vector.ts'

// ─────────────────────────────────────────────────────────────────────────────
// OpticalObject — objet source pour la formation d'image (Phase 7C)
//
// Représente un objet physique observé à travers le système optique.
//   finite   : flèche de hauteur `height` px à la distance `position.x`.
//              Les rayons partent du (ou des) point(s) objet en éventail.
//   infinite : objet à l'infini — rayons parallèles à l'angle de champ
//              (height est le demi-angle de champ, en radians).
//
// Champs générés (`numFieldPoints`) :
//   1 → sommet uniquement (0 %, 100 %)
//   2 → sommet + base    (0 %, 100 %)  ← identique à 1 mais avec base
//   3 → base + mi-champ + sommet       (0 %, 50 %, 100 %)
//
// Pour chaque point objet :
//   • numRays rayons répartis de −spreadAngle/2 à +spreadAngle/2
//     autour de la direction `angle` (axe optique).
//   • Chaque longueur d'onde de `wavelengths` est émise.
//
// Convention : angle = 0 → lumière vers +x, objet à gauche du système.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpticalObjectParams {
  id:              string
  position:        Vec2
  /** Direction de propagation vers le système (radians). 0 = vers +x. */
  angle?:          number
  /** Mode d'objet. */
  mode:            'finite' | 'infinite'
  /**
   * Hauteur de l'objet (px) pour `finite`, ou demi-angle de champ (rad) pour
   * `infinite`.  Positif = vers +y dans le repère de l'objet.
   */
  height:          number
  /** Nombre de rayons par point objet et par longueur d'onde. Défaut : 5. */
  numRays?:        number
  /** Demi-angle d'éventail au point objet (rad). Défaut : π/4 = 45°. */
  spreadAngle?:    number
  /** Nombre de points de champ : 1 (sommet seul), 2 (+base), 3 (+mi). Défaut : 1. */
  numFieldPoints?: number
  /** Largeur du faisceau pour mode infinite (px). Défaut : 200. */
  width?:          number
  /** Longueurs d'onde émises (nm). */
  wavelengths:     number[]
  label?:          string
  polarization?:   's' | 'p' | 'unpolarized'
}

export class OpticalObject implements LightSource {
  readonly type = 'object' as const
  readonly id:           string
  position:              Vec2
  angle:                 number
  mode:                  'finite' | 'infinite'
  height:                number
  numRays:               number
  spreadAngle:           number
  numFieldPoints:        number
  width:                 number
  wavelengths:           number[]
  polarization:          's' | 'p' | 'unpolarized' = 'unpolarized'
  label:                 string

  constructor(p: OpticalObjectParams) {
    this.id             = p.id
    this.position       = { ...p.position }
    this.angle          = p.angle          ?? 0
    this.mode           = p.mode
    this.height         = p.height
    this.numRays        = p.numRays        ?? 5
    this.spreadAngle    = p.spreadAngle    ?? Math.PI / 4
    this.numFieldPoints = p.numFieldPoints ?? 1
    this.width          = p.width          ?? 200
    this.wavelengths    = [...p.wavelengths]
    this.label          = p.label          ?? 'Objet'
    if (p.polarization) this.polarization = p.polarization
  }

  generateRays(): Ray[] {
    const rays: Ray[] = []
    const axisDir = rotate({ x: 1, y: 0 }, this.angle)   // vers le système
    const perpDir = rotate({ x: 0, y: 1 }, this.angle)   // ⊥ axe, direction de la flèche

    if (this.mode === 'infinite') {
      // ── Objet à l'infini : faisceaux parallèles à différents angles de champ ──
      const angles = this._fieldAngles()
      for (const wl of this.wavelengths) {
        for (const fieldAngle of angles) {
          // Direction du faisceau : dévié de fieldAngle par rapport à l'axe
          const dir = rotate(axisDir, -fieldAngle)
          // Perpendiculaire à la direction du faisceau
          const perp: Vec2 = { x: -dir.y, y: dir.x }
          for (let i = 0; i < this.numRays; i++) {
            const t = this.numRays > 1 ? -1 + 2 * i / (this.numRays - 1) : 0
            const offset = t * this.width / 2
            rays.push({
              origin:    { x: this.position.x + perp.x * offset, y: this.position.y + perp.y * offset },
              direction: dir,
              wavelength: wl,
              intensity: 1,
            })
          }
        }
      }
    } else {
      // ── Objet fini : éventail de rayons depuis chaque point objet ──────────
      const fieldHeights = this._fieldHeights()
      for (const wl of this.wavelengths) {
        for (const fh of fieldHeights) {
          const origin: Vec2 = {
            x: this.position.x + perpDir.x * fh,
            y: this.position.y + perpDir.y * fh,
          }
          for (let i = 0; i < this.numRays; i++) {
            const t = this.numRays > 1 ? -1 + 2 * i / (this.numRays - 1) : 0
            const rayAngle = t * this.spreadAngle / 2
            const dir = rotate(axisDir, rayAngle)
            rays.push({ origin: { ...origin }, direction: dir, wavelength: wl, intensity: 1 })
          }
        }
      }
    }
    return rays
  }

  // ── Helpers privés ──────────────────────────────────────────────────────────

  /** Hauteurs de champ (px, dans le repère de l'objet) selon numFieldPoints. */
  private _fieldHeights(): number[] {
    switch (this.numFieldPoints) {
      case 1:  return [this.height]
      case 2:  return [0, this.height]
      default: return [0, this.height / 2, this.height]   // 3 points
    }
  }

  /** Angles de champ (rad) pour le mode `infinite`. */
  private _fieldAngles(): number[] {
    switch (this.numFieldPoints) {
      case 1:  return [this.height]
      case 2:  return [0, this.height]
      default: return [0, this.height / 2, this.height]
    }
  }
}
