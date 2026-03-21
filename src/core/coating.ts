// ─────────────────────────────────────────────────────────────────────────────
// Coating AR mono-couche quart-d'onde — Phase 7D
//
// Une couche mince d'indice n_c d'épaisseur optique λ₀/4 est déposée sur une
// interface n₁/n₂. La formule d'Airy à deux interfaces (approche cohérente
// multi-faisceaux) donne la réflectance exacte :
//
//   r_pol = (r₀₁ + r₁₂ · e^{2iδ}) / (1 + r₀₁ · r₁₂ · e^{2iδ})
//
// avec  δ = (2π · n_c · d · cosθ_c) / λ
//       d = λ₀ / (4·n_c)  →  d_opt = λ₀/4  →  δ(λ₀) = π/2 à incidence normale
//
// En développant |r_pol|² (formule de la réflectance avec e^{2iδ} réel) :
//
//   R = (r₀₁² + r₁₂² + 2·r₀₁·r₁₂·cos2δ) / (1 + r₀₁²·r₁₂² + 2·r₀₁·r₁₂·cos2δ)
//
// Cas optimal (incidence normale) : n_c = √(n₁·n₂)  →  R = 0 à λ₀.
//
// Référence : Born & Wolf, Principles of Optics §7.6.
// ─────────────────────────────────────────────────────────────────────────────

import type { FresnelResult } from './fresnel.ts'
import type { CoatingSpec } from './types.ts'

export type { CoatingSpec }

/**
 * Calcule les coefficients de Fresnel avec coating AR mono-couche quart-d'onde.
 *
 * Utilise la formule d'Airy pour une couche d'épaisseur optique λ₀/4.
 *   δ(λ, θ_c) = (π/2) · (λ₀/λ) · cosθ_c
 *
 * Conventions de polarisation (Hecht) :
 *   rs = (n₁·cosθ₁ − n₂·cosθ₂) / (n₁·cosθ₁ + n₂·cosθ₂)
 *   rp = (n₂·cosθ₁ − n₁·cosθ₂) / (n₂·cosθ₁ + n₁·cosθ₂)
 *
 * @param n1            indice du milieu incident
 * @param n2            indice du milieu réfracté
 * @param cosI          cosinus de l'angle d'incidence (∈ [0, 1])
 * @param coating       spécification du coating
 * @param wavelengthNm  longueur d'onde du rayon (nm)
 */
export function fresnelWithCoating(
  n1: number,
  n2: number,
  cosI: number,
  coating: CoatingSpec,
  wavelengthNm: number,
): FresnelResult {
  // Indice optimal si non spécifié : n_c = √(n₁·n₂) → R = 0 à λ₀ à incidence normale
  const nc      = coating.nCoating ?? Math.sqrt(n1 * n2)
  const lambda0 = coating.wavelength

  // ── Cosinus des angles de réfraction dans la couche et en n₂ ─────────────
  const cI     = Math.min(1, Math.max(0, cosI))
  const sinI2  = 1 - cI * cI

  // TIR dans la couche ou en n₂ → réflexion totale
  const sinC2 = (n1 / nc) ** 2 * sinI2
  const sinT2 = (n1 / n2) ** 2 * sinI2
  if (sinC2 >= 1 || sinT2 >= 1) {
    return { Rs: 1, Rp: 1, Runpol: 1, Ts: 0, Tp: 0, Tunpol: 0 }
  }
  const cosC = Math.sqrt(1 - sinC2)
  const cosT = Math.sqrt(1 - sinT2)

  // ── Phase accumulée dans la couche ────────────────────────────────────────
  //   δ = (2π·n_c·d·cosθ_c)/λ  avec d = λ₀/(4·n_c)
  //   → δ = (π/2)·(λ₀/λ)·cosθ_c
  const delta  = (Math.PI / 2) * (lambda0 / wavelengthNm) * cosC
  const cos2d  = Math.cos(2 * delta)

  // ── Amplitudes de Fresnel aux deux interfaces ─────────────────────────────
  // Interface n₁ → n_c (s-pol) :  rs = (n₁·cosθ₁ − n_c·cosθ_c) / (...)
  const r01s = (n1 * cI  - nc * cosC) / (n1 * cI  + nc * cosC)
  // Interface n_c → n₂ (s-pol)
  const r12s = (nc * cosC - n2 * cosT) / (nc * cosC + n2 * cosT)

  // Interface n₁ → n_c (p-pol) :  rp = (n_c·cosθ₁ − n₁·cosθ_c) / (...)  [Hecht]
  const r01p = (nc * cI  - n1 * cosC) / (nc * cI  + n1 * cosC)
  // Interface n_c → n₂ (p-pol)
  const r12p = (n2 * cosC - nc * cosT) / (n2 * cosC + nc * cosT)

  // ── Réflectance via formule d'Airy ────────────────────────────────────────
  //   R = (r₀₁² + r₁₂² + 2·r₀₁·r₁₂·cos2δ) / (1 + r₀₁²·r₁₂² + 2·r₀₁·r₁₂·cos2δ)
  function airyR(r01: number, r12: number): number {
    const cross = 2 * r01 * r12 * cos2d
    const num   = r01 * r01 + r12 * r12 + cross
    const den   = 1   + (r01 * r12) ** 2 + cross
    if (den <= 0) return 0
    return Math.max(0, Math.min(1, num / den))
  }

  const Rs     = airyR(r01s, r12s)
  const Rp     = airyR(r01p, r12p)
  const Runpol = (Rs + Rp) * 0.5

  return { Rs, Rp, Runpol, Ts: 1 - Rs, Tp: 1 - Rp, Tunpol: 1 - Runpol }
}
