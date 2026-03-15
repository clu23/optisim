import type { Vec2, Ray, HitResult, OpticalSurface, OpticalElement, BoundingBox } from '../types.ts'
import { intersectRaySegment } from '../intersection.ts'
import { add, sub, normalize, rotate } from '../vector.ts'
import { materialIndex, type MaterialId } from '../dispersion.ts'

// ─────────────────────────────────────────────────────────────────────────────
// BlockSurface — interface réfractante (segment)
//
// Chaque côté du bloc est une interface entre le matériau (indice n) et
// l'extérieur (air, indice 1). getRefractiveIndex retourne l'indice du
// matériau ; c'est au traceur de déterminer n₁ et n₂ via containsPoint
// sur le Block parent.
// ─────────────────────────────────────────────────────────────────────────────

class BlockSurface implements OpticalSurface {
  readonly id: string
  private readonly a: Vec2
  private readonly b: Vec2
  // Fonction d'indice dépendante de λ (Cauchy si matériau, constante sinon)
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
// Bloc rectangulaire réfractant — OpticalElement
//
// Paramètres :
//   position  : centre du bloc (pixels)
//   angle     : rotation en radians (0 = largeur selon +x, hauteur selon +y)
//   width     : dimension selon l'axe local x (pixels)
//   height    : dimension selon l'axe local y (pixels)
//   n         : indice de réfraction (n > 1 ; Phase 1 : valeur unique)
//
// Géométrie (angle = 0, repère local centré au centre) :
//   BL = (−width/2, −height/2)
//   BR = (+width/2, −height/2)
//   TR = (+width/2, +height/2)
//   TL = (−width/2, +height/2)
//
// Les sommets sont dans le sens trigonométrique (CCW).
// Surfaces (CCW → normale sortante = rotation −90° du vecteur d'arête) :
//   S0 : BL→BR  (face inférieure,  n_ext = (0, −1))
//   S1 : BR→TR  (face droite,      n_ext = (+1,  0))
//   S2 : TR→TL  (face supérieure,  n_ext = (0, +1))
//   S3 : TL→BL  (face gauche,      n_ext = (−1,  0))
//
// containsPoint : algorithme crossing (lancer de rayon horizontal).
// ─────────────────────────────────────────────────────────────────────────────

export interface BlockParams {
  id: string
  position: Vec2
  /** Rotation du bloc en radians. 0 = largeur selon +x. */
  angle: number
  /** Largeur du bloc en pixels (dimension selon l'axe local x). */
  width: number
  /** Hauteur du bloc en pixels (dimension selon l'axe local y). */
  height: number
  /** Indice de réfraction fixe (utilisé si material est absent). */
  n: number
  /**
   * Matériau du catalogue (optionnel). Si présent, remplace n par la loi de
   * Cauchy : n(λ) varie avec la longueur d'onde → dispersion chromatique.
   */
  material?: MaterialId
  label?: string
}

export class Block implements OpticalElement {
  readonly id: string
  readonly type = 'block'
  position: Vec2
  angle: number
  width: number
  height: number
  n: number
  material: MaterialId | undefined
  label: string

  constructor({ id, position, angle, width, height, n, material, label }: BlockParams) {
    this.id = id
    this.position = position
    this.angle = angle
    this.width = width
    this.height = height
    this.n = n
    this.material = material
    this.label = label ?? 'Bloc'
  }

  /**
   * Calcule les 4 sommets dans le repère monde, ordonnés CCW :
   *   [0] BL, [1] BR, [2] TR, [3] TL  (pour angle = 0)
   */
  vertices(): [Vec2, Vec2, Vec2, Vec2] {
    const hw = this.width / 2
    const hh = this.height / 2
    // Coins locaux en ordre CCW
    const local: Vec2[] = [
      { x: -hw, y: -hh },  // BL
      { x: +hw, y: -hh },  // BR
      { x: +hw, y: +hh },  // TR
      { x: -hw, y: +hh },  // TL
    ]
    return local.map(v => add(this.position, rotate(v, this.angle))) as [Vec2, Vec2, Vec2, Vec2]
  }

  /** Retourne l'indice à la longueur d'onde donnée (Cauchy ou fixe). */
  indexAt(wavelengthNm: number): number {
    return this.material ? materialIndex(this.material, wavelengthNm) : this.n
  }

  getSurfaces(): OpticalSurface[] {
    const [bl, br, tr, tl] = this.vertices()
    // La fonction d'indice est partagée par toutes les faces du bloc
    const fn = (wl: number) => this.indexAt(wl)
    return [
      new BlockSurface(`${this.id}-s0`, bl, br, fn),  // face inférieure
      new BlockSurface(`${this.id}-s1`, br, tr, fn),  // face droite
      new BlockSurface(`${this.id}-s2`, tr, tl, fn),  // face supérieure
      new BlockSurface(`${this.id}-s3`, tl, bl, fn),  // face gauche
    ]
  }

  getBoundingBox(): BoundingBox {
    const verts = this.vertices()
    const MARGIN = 2
    return {
      min: {
        x: Math.min(...verts.map(v => v.x)) - MARGIN,
        y: Math.min(...verts.map(v => v.y)) - MARGIN,
      },
      max: {
        x: Math.max(...verts.map(v => v.x)) + MARGIN,
        y: Math.max(...verts.map(v => v.y)) + MARGIN,
      },
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
    const nv = verts.length
    let inside = false
    for (let i = 0, j = nv - 1; i < nv; j = i++) {
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
