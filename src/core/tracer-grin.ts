import type { Ray, Vec2, RaySegment } from './types.ts'
import type { GRINMedium } from './types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Traceur GRIN — Intégrateur RK4 pour l'équation de l'eikonale
//
// Équation : d/ds (n·dr⃗/ds) = ∇n
//
// État : (r⃗, p⃗) où p⃗ = n·dr⃗/ds  ("impulsion optique")
//   dr⃗/ds = p⃗/n(r⃗)
//   dp⃗/ds = ∇n(r⃗)
//
// Sortie : liste de points intermédiaires (curvePoints) pour le rendu,
//          + position et direction finales (à la sortie du milieu GRIN).
//
// Pas adaptatif : Δs = clamp(ε_adapt / |∇n|, DS_MIN, DS_MAX)
//   → petit pas là où l'indice varie vite, grand pas dans les zones homogènes.
//
// Renormalisation : |p⃗| est renormalisé à n(r⃗) à chaque pas pour éviter
//   la dérive numérique (|p⃗| doit rester = n le long du rayon).
// ─────────────────────────────────────────────────────────────────────────────

/** Paramètres d'intégration GRIN. */
export interface GRINIntegratorParams {
  /** Pas maximum (pixels). */
  dsMax?: number
  /** Pas minimum (pixels). */
  dsMin?: number
  /** Facteur de précision adaptative : Δs = ε / |∇n|. */
  adaptiveEps?: number
  /** Nombre maximum de pas (garde-fou). */
  maxSteps?: number
}

const DEFAULT_DS_MAX      = 8
const DEFAULT_DS_MIN      = 0.1
const DEFAULT_ADAPTIVE_EPS = 0.5
const DEFAULT_MAX_STEPS   = 50_000

// ─────────────────────────────────────────────────────────────────────────────
// Résultat de l'intégration GRIN
// ─────────────────────────────────────────────────────────────────────────────

export interface GRINTraceResult {
  /** Points de la trajectoire courbe (inclut entrée et sortie). */
  points: Vec2[]
  /** Position finale (sortie du milieu ou arrêt). */
  exitPoint: Vec2
  /** Direction finale normalisée (dr⃗/ds à la sortie). */
  exitDirection: Vec2
  /** Chemin optique total = ∫n ds. */
  opticalPath: number
}

// ─────────────────────────────────────────────────────────────────────────────
// integrateGRIN — RK4 + pas adaptatif
// ─────────────────────────────────────────────────────────────────────────────

export function integrateGRIN(
  entryPoint: Vec2,
  entryDirection: Vec2,   // vecteur unitaire
  medium: GRINMedium,
  wavelength: number,
  params: GRINIntegratorParams = {},
): GRINTraceResult {
  const dsMax      = params.dsMax      ?? DEFAULT_DS_MAX
  const dsMin      = params.dsMin      ?? DEFAULT_DS_MIN
  const adaptiveEps = params.adaptiveEps ?? DEFAULT_ADAPTIVE_EPS
  const maxSteps   = params.maxSteps   ?? DEFAULT_MAX_STEPS

  // ── État initial ──────────────────────────────────────────────────────────
  // r⃗ = position,  p⃗ = n·(dr⃗/ds) = n·direction (impulsion optique)
  const n0 = medium.refractiveIndexAt(entryPoint, wavelength)
  let rx = entryPoint.x
  let ry = entryPoint.y
  let px = n0 * entryDirection.x
  let py = n0 * entryDirection.y

  const points: Vec2[] = [{ x: rx, y: ry }]
  let opticalPath = 0

  for (let step = 0; step < maxSteps; step++) {
    // ── Sortie du milieu ? ─────────────────────────────────────────────────
    if (!medium.containsPoint({ x: rx, y: ry })) break

    // ── Gradient en position courante ─────────────────────────────────────
    const g0 = medium.gradientAt({ x: rx, y: ry }, wavelength)
    const n  = medium.refractiveIndexAt({ x: rx, y: ry }, wavelength)

    // Pas adaptatif : Δs = ε / |∇n| (borné)
    const gMag = Math.sqrt(g0.x * g0.x + g0.y * g0.y)
    const ds   = gMag > 1e-10
      ? Math.max(dsMin, Math.min(dsMax, adaptiveEps / gMag))
      : dsMax

    // ── RK4 ──────────────────────────────────────────────────────────────
    // k1
    const k1rx = px / n
    const k1ry = py / n
    const k1px = g0.x
    const k1py = g0.y

    // k2
    const r2x = rx + 0.5 * ds * k1rx
    const r2y = ry + 0.5 * ds * k1ry
    const p2x = px + 0.5 * ds * k1px
    const p2y = py + 0.5 * ds * k1py
    const n2  = medium.refractiveIndexAt({ x: r2x, y: r2y }, wavelength)
    const g2  = medium.gradientAt({ x: r2x, y: r2y }, wavelength)
    const k2rx = p2x / n2
    const k2ry = p2y / n2
    const k2px = g2.x
    const k2py = g2.y

    // k3
    const r3x = rx + 0.5 * ds * k2rx
    const r3y = ry + 0.5 * ds * k2ry
    const p3x = px + 0.5 * ds * k2px
    const p3y = py + 0.5 * ds * k2py
    const n3  = medium.refractiveIndexAt({ x: r3x, y: r3y }, wavelength)
    const g3  = medium.gradientAt({ x: r3x, y: r3y }, wavelength)
    const k3rx = p3x / n3
    const k3ry = p3y / n3
    const k3px = g3.x
    const k3py = g3.y

    // k4
    const r4x = rx + ds * k3rx
    const r4y = ry + ds * k3ry
    const p4x = px + ds * k3px
    const p4y = py + ds * k3py
    const n4  = medium.refractiveIndexAt({ x: r4x, y: r4y }, wavelength)
    const g4  = medium.gradientAt({ x: r4x, y: r4y }, wavelength)
    const k4rx = p4x / n4
    const k4ry = p4y / n4
    const k4px = g4.x
    const k4py = g4.y

    // Mise à jour RK4
    rx += (ds / 6) * (k1rx + 2 * k2rx + 2 * k3rx + k4rx)
    ry += (ds / 6) * (k1ry + 2 * k2ry + 2 * k3ry + k4ry)
    px += (ds / 6) * (k1px + 2 * k2px + 2 * k3px + k4px)
    py += (ds / 6) * (k1py + 2 * k2py + 2 * k3py + k4py)

    // ── Renormalisation de p⃗ : |p⃗| = n(r⃗) ────────────────────────────
    // Évite la dérive numérique qui ferait diverger la norme de p⃗.
    const nNew = medium.refractiveIndexAt({ x: rx, y: ry }, wavelength)
    const pMag = Math.sqrt(px * px + py * py)
    if (pMag > 1e-12) {
      px = px / pMag * nNew
      py = py / pMag * nNew
    }

    // ── Chemin optique Δ(OPL) ≈ n·Δs ─────────────────────────────────────
    opticalPath += n * ds

    // ── Enregistrement du point ─────────────────────────────────────────
    points.push({ x: rx, y: ry })
  }

  // Direction finale = p⃗ / |p⃗|
  const pFinalMag = Math.sqrt(px * px + py * py)
  const exitDir: Vec2 = pFinalMag > 1e-12
    ? { x: px / pFinalMag, y: py / pFinalMag }
    : { x: 1, y: 0 }

  return {
    points,
    exitPoint:     { x: rx, y: ry },
    exitDirection: exitDir,
    opticalPath,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// buildGRINSegment — convertit un GRINTraceResult en RaySegment (avec curvePoints)
// ─────────────────────────────────────────────────────────────────────────────

export function buildGRINSegment(
  result: GRINTraceResult,
  wavelength: number,
  intensity: number,
): RaySegment {
  const pts = result.points
  return {
    start:       pts[0],
    end:         pts[pts.length - 1],
    wavelength,
    intensity,
    curvePoints: pts,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// exitRay — reconstruit le Ray sortant d'un milieu GRIN
// ─────────────────────────────────────────────────────────────────────────────

export function exitRay(source: Ray, result: GRINTraceResult): Ray {
  return {
    origin:      result.exitPoint,
    direction:   result.exitDirection,
    wavelength:  source.wavelength,
    intensity:   source.intensity,
    polarization: source.polarization,
    opticalPath:  (source.opticalPath ?? 0) + result.opticalPath,
  }
}
