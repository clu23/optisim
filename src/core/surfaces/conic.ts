import type { Vec2, Ray, HitResult, OpticalSurface } from '../types.ts'
import { normalize } from '../vector.ts'

// ─────────────────────────────────────────────────────────────────────────────
// ConicSurface — Surface conique en 2D
//
// Repère LOCAL : sommet au point `vertex`, axe optique aligné sur +x local
// (la direction +x locale est `rotate({1,0}, axisAngle)` en repère monde).
//
// Équation implicite (repère local, sommet à l'origine) :
//
//   f(x, y) = (1 + κ) x² − 2Rx + y²  =  0
//
// Cas particuliers :
//   κ =  0  →  sphère    (x − R)² + y² = R²
//   κ = −1  →  parabole  y² = 2Rx
//   κ < −1  →  hyperbole
//   −1 < κ < 0  →  ellipse prolate
//   κ >  0  →  ellipse oblate
//
// Intersection :
//   On amorce Newton-Raphson (NR) depuis l'intersection sphérique (κ=0),
//   qui correspond au cercle osculateur de rayon R centré en (R, 0) local.
//   f'(t) = ∂f/∂x·Dx + ∂f/∂y·Dy = (2(1+κ)x − 2R)·Dx + 2y·Dy
//
// Normale :
//   ∇f = (2(1+κ)x − 2R, 2y)  →  normalisée, orientée vers le rayon incident.
// ─────────────────────────────────────────────────────────────────────────────

const T_MIN      = 1e-9   // seuil anti-auto-intersection
const NR_MAX     = 30     // nombre max d'itérations NR
const NR_TOL     = 1e-10  // convergence sur Δt

export interface ConicSurfaceParams {
  id: string
  /** Position du sommet dans le repère monde. */
  vertex: Vec2
  /**
   * Direction de l'axe optique (radians, repère monde).
   * L'axe pointe du sommet vers le centre de courbure (côté concave).
   * angle=0 → axe vers +x.  angle=π → axe vers −x.
   */
  axisAngle: number
  /** Rayon de courbure au sommet (> 0). */
  R: number
  /** Constante de conicité κ (0 = sphère, −1 = parabole, …). */
  kappa: number
  /**
   * Demi-ouverture de la surface : contrainte |y_local| ≤ halfHeight.
   * Empêche les intersections hors du miroir physique.
   */
  halfHeight: number
  /** Indice de réfraction fixe (1 pour un miroir pur, >1 pour une surface réfractante). */
  n?: number
  /**
   * Fonction d'indice dépendante de λ (Cauchy).
   * Si fournie, prend la priorité sur `n`.
   * Permet la dispersion chromatique sur les surfaces coniques réfractantes.
   */
  indexFn?: (wavelengthNm: number) => number
}

export class ConicSurface implements OpticalSurface {
  readonly id: string
  readonly vertex: Vec2
  readonly axisAngle: number
  readonly R: number
  readonly kappa: number
  readonly halfHeight: number
  private readonly _n: number
  private readonly _indexFn: ((wl: number) => number) | undefined

  constructor(p: ConicSurfaceParams) {
    this.id         = p.id
    this.vertex     = p.vertex
    this.axisAngle  = p.axisAngle
    this.R          = p.R
    this.kappa      = p.kappa
    this.halfHeight = p.halfHeight
    this._n         = p.n ?? 1
    this._indexFn   = p.indexFn
  }

  // ── Transformations repère monde ↔ repère local ──────────────────────────

  /**
   * Point monde → coordonnées locales
   * (sommet=origine, axe optique=+x local).
   */
  private toLocal(p: Vec2): Vec2 {
    const dx  = p.x - this.vertex.x
    const dy  = p.y - this.vertex.y
    const cos = Math.cos(this.axisAngle)
    const sin = Math.sin(this.axisAngle)
    // Rotation de −axisAngle
    return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos }
  }

  /**
   * Direction monde → direction locale (rotation seule, sans translation).
   */
  private toLocalDir(d: Vec2): Vec2 {
    const cos = Math.cos(this.axisAngle)
    const sin = Math.sin(this.axisAngle)
    return { x: d.x * cos + d.y * sin, y: -d.x * sin + d.y * cos }
  }

  /**
   * Direction locale → direction monde (rotation de +axisAngle).
   */
  private toWorldDir(d: Vec2): Vec2 {
    const cos = Math.cos(this.axisAngle)
    const sin = Math.sin(this.axisAngle)
    return { x: d.x * cos - d.y * sin, y: d.x * sin + d.y * cos }
  }

  /**
   * Point local → point monde.
   */
  private toWorld(p: Vec2): Vec2 {
    const cos = Math.cos(this.axisAngle)
    const sin = Math.sin(this.axisAngle)
    return {
      x: this.vertex.x + p.x * cos - p.y * sin,
      y: this.vertex.y + p.x * sin + p.y * cos,
    }
  }

  // ── Intersection ──────────────────────────────────────────────────────────

  intersect(ray: Ray): HitResult | null {
    const { R, kappa: k, halfHeight } = this

    // ── 1. Rayon en repère local ─────────────────────────────────────────────
    const O = this.toLocal(ray.origin)
    const D = this.toLocalDir(ray.direction)
    const Ox = O.x, Oy = O.y
    const Dx = D.x, Dy = D.y

    // ── 2. Intersection de la sphère κ=0 comme amorce NR ────────────────────
    //   Sphère oscultrice : (x−R)² + y² = R²
    //   Équation quadratique en t :
    //     a·t² + b·t + c = 0
    //     a = Dx² + Dy²  (= 1 car direction normalisée)
    //     b = 2·((Ox−R)·Dx + Oy·Dy)
    //     c = (Ox−R)² + Oy² − R²
    const oxR = Ox - R
    const a   = Dx * Dx + Dy * Dy   // ≈ 1
    const b   = 2 * (oxR * Dx + Oy * Dy)
    const c   = oxR * oxR + Oy * Oy - R * R
    const disc = b * b - 4 * a * c

    // Pas d'intersection sphérique → pas d'intersection conique (cas général)
    if (disc < 0) return null

    const sqrtDisc = Math.sqrt(disc)
    const t1 = (-b - sqrtDisc) / (2 * a)
    const t2 = (-b + sqrtDisc) / (2 * a)

    // Candidats positifs, plus petit en premier (face avant du miroir)
    const seeds: number[] = [t1, t2].filter(t => t > T_MIN).sort((x, y) => x - y)
    if (seeds.length === 0) return null

    // ── 3. Newton-Raphson depuis chaque candidat ─────────────────────────────
    //   f(x, y)  = (1+κ)·x² − 2R·x + y²
    //   f'(t)    = (2(1+κ)·x − 2R)·Dx + 2y·Dy
    for (const t0 of seeds) {
      let t = t0

      for (let iter = 0; iter < NR_MAX; iter++) {
        const x    = Ox + t * Dx
        const y    = Oy + t * Dy
        const f    = (1 + k) * x * x - 2 * R * x + y * y
        const dfdt = (2 * (1 + k) * x - 2 * R) * Dx + 2 * y * Dy

        if (Math.abs(dfdt) < 1e-14) break

        const dt = f / dfdt
        t -= dt
        if (Math.abs(dt) < NR_TOL) break
      }

      // ── 4. Vérifications post-NR ─────────────────────────────────────────
      if (t <= T_MIN) continue

      const xHit = Ox + t * Dx
      const yHit = Oy + t * Dy

      // Convergence : f(hit) ≈ 0
      const fCheck = (1 + k) * xHit * xHit - 2 * R * xHit + yHit * yHit
      if (Math.abs(fCheck) > 1e-5 * Math.abs(R)) continue

      // La conique s'étend dans le signe de R :
      //   R > 0 → vers +x_local (xHit ∈ [0, sagMax])   — convexe vers l'incident
      //   R < 0 → vers -x_local (xHit ∈ [sagMax, 0])   — concave vers l'incident (lentille divergente)
      // sagMax = sag(halfHeight, R, κ) = h² / (R·(1 + √(1−(1+κ)h²/R²)))
      const argMax = 1 - (1 + k) * (halfHeight * halfHeight) / (R * R)
      const sagMax = argMax >= 0
        ? (halfHeight * halfHeight) / (R * (1 + Math.sqrt(argMax)))
        : halfHeight * halfHeight / R   // approximation sécurisée si κ>0 extrême
      if (R >= 0) {
        if (xHit < -1e-6)     continue
        if (xHit > sagMax + 1) continue
      } else {
        if (xHit >  1e-6)     continue   // R<0 : sommet à x=0, surface en x<0
        if (xHit < sagMax - 1) continue
      }

      // Contrainte d'ouverture
      if (Math.abs(yHit) > halfHeight) continue

      // ── 5. Normale en repère local ─────────────────────────────────────────
      //   ∇f = (2(1+κ)·x − 2R,  2·y)  ∝  ((1+κ)·x − R,  y)
      const nx_loc = (1 + k) * xHit - R
      const ny_loc = yHit

      // Normale sortante (avant orientation) en repère monde
      const nWorld = normalize(this.toWorldDir({ x: nx_loc, y: ny_loc }))

      // Surfaces miroir (n=1, pas de indexFn) : une seule face réfléchissante.
      // Le rayon doit venir du côté concave → dot(d, n_sortant) > 0
      // (la normale sortante pointe VERS le rayon incident avant flip).
      // Cela rejette les rayons arrivant par l'arrière du miroir.
      // Note : si indexFn est fourni, la surface est réfractante même si _n=1 par défaut.
      const dotOuter = ray.direction.x * nWorld.x + ray.direction.y * nWorld.y
      const isMirror = this._n === 1 && this._indexFn === undefined
      if (isMirror && dotOuter <= 0) continue

      // Orienter vers le rayon incident : dot(d, n_final) < 0
      const flip = dotOuter > 0 ? -1 : 1
      const normal: Vec2 = { x: flip * nWorld.x, y: flip * nWorld.y }

      // ── 6. Point d'intersection en repère monde ───────────────────────────
      const point = this.toWorld({ x: xHit, y: yHit })

      return { point, normal, t, surfaceId: this.id }
    }

    return null
  }

  // ── Normale externe (usage rendu/debug) ──────────────────────────────────

  /**
   * Normale sortante de la conique au point `p` (repère monde).
   * Ne garantit pas l'orientation vers le rayon incident.
   */
  getNormal(p: Vec2): Vec2 {
    const { k, R } = { k: this.kappa, R: this.R }
    const loc = this.toLocal(p)
    const nx = (1 + k) * loc.x - R
    const ny = loc.y
    return normalize(this.toWorldDir({ x: nx, y: ny }))
  }

  getRefractiveIndex(wavelength: number): number {
    return this._indexFn ? this._indexFn(wavelength) : this._n
  }
}
