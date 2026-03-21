import type { Ray, Scene, TraceResult } from './types.ts'
import { ImagePlane } from './elements/image-plane.ts'
import { traceRay } from './tracer.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Ray Fan (aberration transversale) — Phase 7B
//
// Le ray fan représente l'aberration transversale Δy(h) pour chaque longueur
// d'onde : différence entre la hauteur d'impact sur le plan image et celle du
// rayon chef (h=0).  Sa forme révèle le type d'aberration :
//   — linéaire : défocus (tilt du plan image)
//   — cubique  : aberration sphérique de Seidel
//   — constante décalée : coma
// ─────────────────────────────────────────────────────────────────────────────

export interface RayFanConfig {
  /** Position x du plan pupille d'entrée (px). */
  pupilX:      number
  /** Demi-ouverture de la pupille (px). */
  pupilRadius: number
  /** Direction des rayons incidents (vecteur normalisé). */
  rayDir:      { x: number; y: number }
  /** Nombre de rayons par longueur d'onde (impair → h=0 inclus). Défaut 21. */
  nRays?:      number
  /** Longueurs d'onde à tracer (nm). */
  wavelengths: number[]
}

export interface RayFanPoint {
  /** Hauteur pupille normalisée, ∈ [−1, +1]. */
  h:      number
  /** Aberration transversale (px), relative au rayon chef (h=0). */
  deltaY: number
}

export interface RayFanCurve {
  wavelength: number
  points:     RayFanPoint[]
}

// ─────────────────────────────────────────────────────────────────────────────
// LCA (Aberration Chromatique Longitudinale) — Phase 7B
//
// Position du foyer paraxial en fonction de λ.
// Méthode : rayon paraxial (h = 1 % du rayon de pupille), extrapolation du
// dernier segment vers y = 0 (axe optique).
// ─────────────────────────────────────────────────────────────────────────────

export interface LCAConfig {
  pupilX:      number
  pupilRadius: number
  rayDir:      { x: number; y: number }
  /** Longueurs d'onde à échantillonner (nm). */
  wavelengths: number[]
}

export interface LCAPoint {
  wavelength: number
  /** Position axiale du foyer paraxial (px). */
  focusX:     number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intersecte un TraceResult avec le plan image et retourne la coordonnée
 * locale y (px depuis le centre) ou null si aucune intersection valide.
 * On prend la dernière intersection forward (après tous les éléments optiques).
 */
function hitPlane(result: TraceResult, plane: ImagePlane): number | null {
  const ax = plane.axisDir.x, ay = plane.axisDir.y
  const tx = plane.planeDir.x, ty = plane.planeDir.y
  const px = plane.position.x, py = plane.position.y

  let hit: number | null = null
  for (const seg of result.segments) {
    const sdx = seg.end.x - seg.start.x
    const sdy = seg.end.y - seg.start.y
    const dAxis = sdx * ax + sdy * ay
    if (dAxis <= 1e-10) continue
    const t = ((px - seg.start.x) * ax + (py - seg.start.y) * ay) / dAxis
    if (t <= 0 || t >= 1) continue
    const hx = seg.start.x + t * sdx - px
    const hy = seg.start.y + t * sdy - py
    const localY = hx * tx + hy * ty
    if (Math.abs(localY) > plane.height) continue
    hit = localY
  }
  return hit
}

// ─────────────────────────────────────────────────────────────────────────────
// computeRayFan
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule le ray fan en traçant des rayons à différentes hauteurs de pupille.
 *
 * Pour chaque longueur d'onde, trace nRays rayons depuis la pupille
 * d'entrée à hauteurs h ∈ [−pupilRadius, +pupilRadius], collecte
 * l'intersection avec le plan image et soustrait le hit du rayon chef (h≈0).
 *
 * @param scene  Scène optique (le plan image peut en faire partie, il est transparent)
 * @param plane  Plan image servant de détecteur
 * @param cfg    Paramètres de la pupille et des longueurs d'onde
 */
export function computeRayFan(
  scene: Scene,
  plane: ImagePlane,
  cfg:   RayFanConfig,
): RayFanCurve[] {
  const nRays = cfg.nRays ?? 21
  const rLen  = Math.hypot(cfg.rayDir.x, cfg.rayDir.y)
  const dx = cfg.rayDir.x / rLen
  const dy = cfg.rayDir.y / rLen

  // Vecteur perpendiculaire (direction de la hauteur de pupille)
  // Pour un faisceau horizontal (dx=1,dy=0) : perpX=0, perpY=1 → h = y
  const perpX = -dy, perpY = dx

  const curves: RayFanCurve[] = []

  for (const wl of cfg.wavelengths) {
    const hits: Array<{ h: number; y: number }> = []

    for (let i = 0; i < nRays; i++) {
      const h   = nRays > 1 ? -1 + 2 * i / (nRays - 1) : 0
      const hPx = h * cfg.pupilRadius
      const ray: Ray = {
        origin:    { x: cfg.pupilX + perpX * hPx, y: perpY * hPx },
        direction: { x: dx, y: dy },
        wavelength: wl,
        intensity: 1,
      }
      const result = traceRay(ray, scene)
      const y      = hitPlane(result, plane)
      if (y !== null) hits.push({ h, y })
    }

    if (hits.length === 0) continue

    // Rayon chef : point de hits le plus proche de h=0
    const chief = hits.reduce((best, cur) => Math.abs(cur.h) < Math.abs(best.h) ? cur : best)

    curves.push({
      wavelength: wl,
      points:     hits.map(({ h, y }) => ({ h, deltaY: y - chief.y })),
    })
  }

  return curves
}

// ─────────────────────────────────────────────────────────────────────────────
// computeLCA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calcule l'aberration chromatique longitudinale (ACL) :
 * position axiale du foyer paraxial en fonction de la longueur d'onde.
 *
 * Pour chaque λ, trace un rayon paraxial (h = 1 % du rayon de pupille),
 * extrapole le dernier segment vers y = 0 (axe optique horizontal).
 *
 * @returns Points triés par longueur d'onde croissante.
 */
export function computeLCA(scene: Scene, cfg: LCAConfig): LCAPoint[] {
  const rLen  = Math.hypot(cfg.rayDir.x, cfg.rayDir.y)
  const dx    = cfg.rayDir.x / rLen
  const dy    = cfg.rayDir.y / rLen
  const perpX = -dy, perpY = dx

  // Hauteur paraxiale : 1 % du rayon de pupille
  const hPx = 0.01 * cfg.pupilRadius

  const points: LCAPoint[] = []

  for (const wl of cfg.wavelengths) {
    const ray: Ray = {
      origin:    { x: cfg.pupilX + perpX * hPx, y: perpY * hPx },
      direction: { x: dx, y: dy },
      wavelength: wl,
      intensity: 1,
    }
    const result = traceRay(ray, scene)

    // Dernier segment progressant dans la direction de propagation
    let focusX: number | null = null
    for (let i = result.segments.length - 1; i >= 0; i--) {
      const seg = result.segments[i]
      const sdx = seg.end.x - seg.start.x
      const sdy = seg.end.y - seg.start.y
      if (sdx * dx + sdy * dy <= 0) continue   // segment rétrograde
      if (Math.abs(sdy) < 1e-10) break          // parallèle à l'axe → foyer à l'infini
      // Extrapolation vers y = 0 : t tel que start.y + t·sdy = 0
      const t = -seg.start.y / sdy
      focusX = seg.start.x + t * sdx
      break
    }

    if (focusX !== null && isFinite(focusX)) {
      points.push({ wavelength: wl, focusX })
    }
  }

  return points.sort((a, b) => a.wavelength - b.wavelength)
}

// ─────────────────────────────────────────────────────────────────────────────
// autoRayFanConfig — dérive la configuration depuis la scène et le plan image
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dérive automatiquement les paramètres du ray fan / LCA depuis la scène :
 * — pupilX      : bord gauche du premier élément optique − 30 px
 * — pupilRadius : hauteur du plan image × 0.85
 * — rayDir      : (1, 0)  (propagation gauche → droite)
 * — nRays       : 21
 */
export function autoRayFanConfig(
  scene:       Scene,
  plane:       ImagePlane,
  wavelengths: number[],
): RayFanConfig {
  let minX = Infinity
  for (const el of scene.elements) {
    if (el instanceof ImagePlane) continue
    const bb = el.getBoundingBox()
    minX = Math.min(minX, bb.min.x)
  }
  const pupilX = isFinite(minX) ? minX - 30 : plane.position.x - 300

  return {
    pupilX,
    pupilRadius: plane.height * 0.85,
    rayDir:      { x: 1, y: 0 },
    nRays:       21,
    wavelengths,
  }
}
