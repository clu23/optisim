import type { TraceResult } from './types.ts'
import type { ImagePlane } from './elements/image-plane.ts'

// ─────────────────────────────────────────────────────────────────────────────
// SpotData — métriques du spot diagram (Phase 7B)
//
// Toutes les coordonnées sont en pixels internes (px).
// La conversion vers µm se fait à l'affichage via WorldUnits.scale.
// ─────────────────────────────────────────────────────────────────────────────

export interface SpotPoint {
  /** Coordonnée locale le long du plan détecteur (px depuis le centre). */
  y: number
  wavelength: number
  intensity:  number
}

export interface SpotData {
  points:    SpotPoint[]
  /** Centroïde en coordonnées locales pondéré par l'intensité (px). */
  centroid:  number
  /** Rayon RMS depuis le centroïde (px). */
  rmsRadius: number
  /** Rayon maximal depuis le centroïde (px). */
  maxRadius: number
}

// ─────────────────────────────────────────────────────────────────────────────
// collectSpots
//
// Pour chaque segment (A → B), calcule l'intersection avec le plan image :
//   t = (pos − A) · axisDir / ((B − A) · axisDir)
//   Si 0 < t < 1 : l'intersection existe.
//   Coord locale : y_local = (A + t(B−A) − pos) · planeDir
//   Rejetée si |y_local| > height.
// ─────────────────────────────────────────────────────────────────────────────

export function collectSpots(plane: ImagePlane, results: TraceResult[]): SpotData {
  const ax = plane.axisDir.x,  ay = plane.axisDir.y   // normale au plan
  const tx = plane.planeDir.x, ty = plane.planeDir.y  // tangente (long du détecteur)
  const px = plane.position.x, py = plane.position.y

  const points: SpotPoint[] = []

  for (const result of results) {
    for (const seg of result.segments) {
      const dx = seg.end.x - seg.start.x
      const dy = seg.end.y - seg.start.y
      const dDotAxis = dx * ax + dy * ay
      // Seuls les segments voyageant DANS le sens de l'axe optique (dDotAxis > 0)
      // sont capturés — évite de compter les rayons incidents avant réflexion/réfraction.
      if (dDotAxis <= 1e-10) continue

      const t = ((px - seg.start.x) * ax + (py - seg.start.y) * ay) / dDotAxis
      if (t <= 0 || t >= 1) continue  // intersection hors segment

      const hx = seg.start.x + t * dx - px
      const hy = seg.start.y + t * dy - py
      const localY = hx * tx + hy * ty

      if (Math.abs(localY) > plane.height) continue  // hors détecteur

      points.push({ y: localY, wavelength: seg.wavelength, intensity: seg.intensity })
    }
  }

  if (points.length === 0) {
    return { points: [], centroid: 0, rmsRadius: 0, maxRadius: 0 }
  }

  // Centroïde pondéré par l'intensité
  const totalW = points.reduce((s, p) => s + p.intensity, 0)
  const centroid = totalW > 0
    ? points.reduce((s, p) => s + p.y * p.intensity, 0) / totalW
    : points.reduce((s, p) => s + p.y, 0) / points.length

  // RMS radius depuis le centroïde
  const rmsRadius = Math.sqrt(
    points.reduce((s, p) => s + (p.y - centroid) ** 2, 0) / points.length
  )

  const maxRadius = points.reduce((m, p) => Math.max(m, Math.abs(p.y - centroid)), 0)

  return { points, centroid, rmsRadius, maxRadius }
}
