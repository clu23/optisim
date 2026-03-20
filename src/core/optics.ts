import type { Vec2 } from './types.ts'
import { dot, add, scale, normalize } from './vector.ts'

// Réexporte reflect depuis vector (loi de la réflexion : r⃗ = d⃗ − 2(d⃗·n⃗)n⃗)
export { reflect } from './vector.ts'

// Réexporte les fonctions de Fresnel (Phase 5)
export { fresnelCoefficients, fresnelReflectance, fresnelTransmittance, brewsterAngle } from './fresnel.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Réfraction vectorielle — Loi de Snell-Descartes
//
// n₁ sin θ₁ = n₂ sin θ₂
//
// Forme vectorielle (n⃗ orientée vers le rayon incident, donc d⃗·n⃗ < 0) :
//   t⃗ = (n₁/n₂)·d⃗ + ((n₁/n₂)·cosθ₁ − cosθ₂)·n⃗
//   cosθ₁ = −d⃗·n⃗
//   cosθ₂ = √(1 − (n₁/n₂)²·(1 − cosθ₁²))
//
// Retourne null si réflexion totale interne (sin²θ₂ > 1).
// ─────────────────────────────────────────────────────────────────────────────
export function refract(d: Vec2, n: Vec2, n1: number, n2: number): Vec2 | null {
  const ratio = n1 / n2
  // cosθ₁ = −d⃗·n⃗  (positif car n⃗ est orientée vers l'incident)
  const cosI = -dot(d, n)
  // sin²θ₂ = (n₁/n₂)²·sin²θ₁ = ratio²·(1 − cos²θ₁)
  const sin2T = ratio * ratio * (1 - cosI * cosI)

  // Réflexion totale interne : sin²θ₂ > 1
  if (sin2T > 1) return null

  const cosT = Math.sqrt(1 - sin2T)

  // t⃗ = ratio·d⃗ + (ratio·cosθ₁ − cosθ₂)·n⃗
  return normalize(add(scale(d, ratio), scale(n, ratio * cosI - cosT)))
}

// ─────────────────────────────────────────────────────────────────────────────
// Angle d'incidence (radians) depuis la direction et la normale
// Convention : θ ∈ [0, π/2]
// ─────────────────────────────────────────────────────────────────────────────
export function incidenceAngle(d: Vec2, n: Vec2): number {
  // cosθ = |d⃗·n⃗| — on prend la valeur absolue pour gérer les deux sens
  return Math.acos(Math.min(1, Math.abs(dot(d, n))))
}

// ─────────────────────────────────────────────────────────────────────────────
// Angle critique de réflexion totale interne (radians)
// θ_c = arcsin(n₂/n₁)  avec n₁ > n₂
// Retourne null si n₁ ≤ n₂ (pas de réflexion totale possible)
// ─────────────────────────────────────────────────────────────────────────────
export function criticalAngle(n1: number, n2: number): number | null {
  if (n1 <= n2) return null
  return Math.asin(n2 / n1)
}
