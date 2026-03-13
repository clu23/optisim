import type { Vec2, Ray, HitResult, OpticalSurface, OpticalElement, BoundingBox } from '../types.ts'
import { intersectRaySegment } from '../intersection.ts'
import { add, sub, dot, scale, normalize, rotate } from '../vector.ts'

// ─────────────────────────────────────────────────────────────────────────────
// ThinLensSurface
//
// Surface unique représentant la lentille mince (segment).
//
// Physique — formule en pentes (exacte, réversible) :
//
//   pente_out = pente_in − h/f
//
// Sous forme vectorielle :
//
//   d⃗_out = normalize(d⃗_in − (h/f)·(d⃗_in·â)·l̂)
//
//   h     = (P − centre)·l̂   hauteur signée au point d'impact
//   â     = vecteur directeur de l'axe optique (normalisé)
//   l̂     = vecteur directeur de la lentille (⊥ â, normalisé)
//   d⃗·â   = composante axiale (facteur correctif non-paraxial)
//
// Cette formule garantit :
//   • Rayons parallèles → foyer image F₂ = centre + f·â         (EXACT)
//   • Rayon issu de F₁ = centre − f·â   → parallèle à l'axe    (EXACT)
//   • Réversibilité optique (invariance par renversement temporel)
//
// Le traceur identifie ThinLensSurface via instanceof et appelle deflect()
// au lieu du pipeline Snell-Descartes standard.
// ─────────────────────────────────────────────────────────────────────────────

export class ThinLensSurface implements OpticalSurface {
  readonly id: string
  private readonly a: Vec2
  private readonly b: Vec2
  private readonly center: Vec2
  readonly lensDir: Vec2     // Direction ⊥ à l'axe (hauteur de la lentille)
  readonly axisDir: Vec2     // Direction de l'axe optique
  readonly focalLength: number

  constructor(
    id: string,
    a: Vec2, b: Vec2,
    center: Vec2,
    lensDir: Vec2, axisDir: Vec2,
    focalLength: number,
  ) {
    this.id = id
    this.a = a
    this.b = b
    this.center = center
    this.lensDir = lensDir
    this.axisDir = axisDir
    this.focalLength = focalLength
  }

  intersect(ray: Ray): HitResult | null {
    const raw = intersectRaySegment(ray, this.a, this.b)
    if (raw === null) return null
    return { point: raw.point, normal: raw.normal, t: raw.t, surfaceId: this.id }
  }

  getNormal(_point: Vec2): Vec2 {
    // Normale = axe optique (perpendiculaire au plan de la lentille)
    return this.axisDir
  }

  // Milieu identique des deux côtés (air) — pas d'interface réfringente
  getRefractiveIndex(_wavelength: number): number {
    return 1
  }

  /**
   * Applique la loi de la lentille mince (formule en pentes exacte) :
   *   d⃗_out = normalize(d⃗_in − (h/f)·(d⃗_in·â)·l̂)
   *
   * @param incomingDir Direction normalisée du rayon incident
   * @param hitPoint    Point d'impact sur la lentille
   * @returns Direction normalisée du rayon dévié
   */
  deflect(incomingDir: Vec2, hitPoint: Vec2): Vec2 {
    // Hauteur signée du point d'impact par rapport au centre de la lentille
    const h = dot(sub(hitPoint, this.center), this.lensDir)
    // Composante axiale : facteur correctif pour les rayons non-paraxiaux
    const axisComp = dot(incomingDir, this.axisDir)
    // d_out = normalize(d_in − (h/f)·axisComp·lensDir)
    return normalize(sub(incomingDir, scale(this.lensDir, h * axisComp / this.focalLength)))
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ThinLens — OpticalElement
//
// Lentille mince centrée en `position`, axe optique selon `angle` (radians),
// ouverture `height`, longueur focale signée `focalLength`.
//
// Convention (angle = 0) :
//   Axe optique   : +x
//   Plan lentille : vertical (y)
//   Extrémités    : position ± (0, height/2)
//   Foyer image F₂ : position + (f,  0)
//   Foyer objet F₁ : position + (−f, 0)
//
// f > 0 → lentille convergente   (ex. biconvexe)
// f < 0 → lentille divergente    (ex. biconcave)
//
// containsPoint retourne toujours false :
// la lentille est un segment de mesure nulle, sans volume intérieur.
// ─────────────────────────────────────────────────────────────────────────────

export interface ThinLensParams {
  id: string
  position: Vec2
  /** Direction de l'axe optique (radians). 0 = lumière se propageant selon +x. */
  angle: number
  /** Longueur focale signée (pixels). f > 0 convergente, f < 0 divergente. */
  focalLength: number
  /** Hauteur de l'ouverture (pixels). */
  height: number
  label?: string
}

export class ThinLens implements OpticalElement {
  readonly id: string
  readonly type = 'thin-lens'
  position: Vec2
  angle: number
  focalLength: number
  height: number
  label: string

  constructor({ id, position, angle, focalLength, height, label }: ThinLensParams) {
    this.id = id
    this.position = position
    this.angle = angle
    this.focalLength = focalLength
    this.height = height
    this.label = label ?? (focalLength > 0 ? 'Lentille convergente' : 'Lentille divergente')
  }

  /** Vecteur unitaire de l'axe optique : rotate({1,0}, angle). */
  axisDirection(): Vec2 {
    return rotate({ x: 1, y: 0 }, this.angle)
  }

  /** Vecteur unitaire de la hauteur (⊥ axe) : rotate({0,1}, angle). */
  lensDirection(): Vec2 {
    return rotate({ x: 0, y: 1 }, this.angle)
  }

  /** Foyer image F₂ = position + focalLength · axisDirection. */
  focalPoint(): Vec2 {
    return add(this.position, scale(this.axisDirection(), this.focalLength))
  }

  /** Extrémités du segment lentille [A, B] dans le repère monde. */
  endpoints(): [Vec2, Vec2] {
    const half = this.height / 2
    const lDir = this.lensDirection()
    return [
      add(this.position, scale(lDir, -half)),
      add(this.position, scale(lDir,  half)),
    ]
  }

  getSurfaces(): OpticalSurface[] {
    const [a, b] = this.endpoints()
    return [
      new ThinLensSurface(
        `${this.id}-surface`,
        a, b,
        this.position,
        this.lensDirection(),
        this.axisDirection(),
        this.focalLength,
      ),
    ]
  }

  getBoundingBox(): BoundingBox {
    const [a, b] = this.endpoints()
    const MARGIN = 2
    return {
      min: { x: Math.min(a.x, b.x) - MARGIN, y: Math.min(a.y, b.y) - MARGIN },
      max: { x: Math.max(a.x, b.x) + MARGIN, y: Math.max(a.y, b.y) + MARGIN },
    }
  }

  // Segment de mesure nulle : aucun point n'est « à l'intérieur »
  containsPoint(_point: Vec2): boolean {
    return false
  }
}
