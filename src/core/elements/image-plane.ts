import type { OpticalElement, OpticalSurface, Vec2, BoundingBox } from '../types.ts'
import { rotate } from '../vector.ts'

// ─────────────────────────────────────────────────────────────────────────────
// ImagePlane — plan image draggable (Phase 7B)
//
// Transparent au tracé de rayons (getSurfaces() = []).
// Les intersections sont collectées a posteriori par collectSpots().
//
// Convention de l'angle :
//   angle=0  → axe optique selon +X (détecteur vertical)
//   angle=π  → axe optique selon −X (même chose, sens opposé)
//   La direction axiale est rotate({x:1,y:0}, angle).
//   La direction tangentielle (long du détecteur) est rotate({x:0,y:1}, angle).
// ─────────────────────────────────────────────────────────────────────────────

export interface ImagePlaneParams {
  id: string
  position: Vec2
  /** Angle de l'axe optique (normal au plan détecteur), en radians. */
  angle: number
  /** Demi-hauteur du détecteur (px). */
  height: number
  label?: string
}

export class ImagePlane implements OpticalElement {
  readonly type = 'image-plane' as const
  readonly id:    string
  position:       Vec2
  /** Angle de l'axe optique (normal au plan). rad. */
  angle:          number
  /** Demi-hauteur du détecteur (px). */
  height:         number
  label:          string

  constructor(p: ImagePlaneParams) {
    this.id       = p.id
    this.position = { ...p.position }
    this.angle    = p.angle
    this.height   = p.height
    this.label    = p.label ?? 'Plan image'
  }

  /** Direction de l'axe optique (normale au plan, direction d'arrivée de la lumière). */
  get axisDir(): Vec2 { return rotate({ x: 1, y: 0 }, this.angle) }

  /** Direction le long du plan détecteur (tangente). */
  get planeDir(): Vec2 { return rotate({ x: 0, y: 1 }, this.angle) }

  /** Extrémités du détecteur dans le repère monde. */
  endpoints(): [Vec2, Vec2] {
    const pd = this.planeDir
    return [
      { x: this.position.x - this.height * pd.x, y: this.position.y - this.height * pd.y },
      { x: this.position.x + this.height * pd.x, y: this.position.y + this.height * pd.y },
    ]
  }

  /** Le plan image est transparent : aucune surface optique. */
  getSurfaces(): OpticalSurface[] { return [] }

  getBoundingBox(): BoundingBox {
    const [a, b] = this.endpoints()
    const MARGIN = 8
    return {
      min: { x: Math.min(a.x, b.x) - MARGIN, y: Math.min(a.y, b.y) - MARGIN },
      max: { x: Math.max(a.x, b.x) + MARGIN, y: Math.max(a.y, b.y) + MARGIN },
    }
  }

  containsPoint(_p: Vec2): boolean {
    // Plan image infiniment mince — ne contient aucun point intérieur
    return false
  }
}
