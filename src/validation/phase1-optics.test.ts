/**
 * Validation physique — Phase 1 — Optique de base
 *
 * Chaque test correspond à une scène de référence du SPECS.md §6.
 * Le résultat est comparé à la valeur analytique avec une tolérance ε.
 *
 * V1 : Réflexion miroir plan 45°       — θ_r = θ_i = 45°
 * V2 : Réfraction air→verre 30°        — θ₂ = arcsin(sin30°/1.5) = 19.471°
 * V3 : Réflexion totale verre→air 45°  — sin45°·1.5 > 1 → RTI
 */

import { describe, it, expect } from 'vitest'
import { reflect, refract, incidenceAngle, criticalAngle } from '../core/optics.ts'
import { normalize, dot, length } from '../core/vector.ts'

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

// Tolérance angulaire : 1e-6 rad ≈ 0.00006°
const EPS_ANGLE = 1e-6
// Tolérance de position (vecteur unitaire)
const EPS_VEC = 1e-9

// ─── V1 : Réflexion miroir plan 45° ─────────────────────────────────────────
//
// Scène : rayon horizontal (1, 0) frappant un miroir incliné à 45°.
// Normale du miroir orientée vers l'incident : (-1, 1)/√2.
// Attendu : rayon réfléchi = (0, 1), θ_r = θ_i = 45°.
// ─────────────────────────────────────────────────────────────────────────────
describe('V1 — Réflexion miroir plan 45°', () => {
  const d = { x: 1, y: 0 }                        // rayon incident horizontal
  const n = normalize({ x: -1, y: 1 })            // normale du miroir à 45°
  const r = reflect(d, n)

  it('rayon réfléchi pointe vers le haut (0, 1)', () => {
    expect(r.x).toBeCloseTo(0, 9)
    expect(r.y).toBeCloseTo(1, 9)
  })

  it('θ_r = θ_i = 45°', () => {
    const thetaI = incidenceAngle(d, n) * RAD
    const thetaR = incidenceAngle(r, n) * RAD
    expect(Math.abs(thetaI - 45)).toBeLessThan(EPS_ANGLE * RAD)
    expect(Math.abs(thetaR - 45)).toBeLessThan(EPS_ANGLE * RAD)
    expect(Math.abs(thetaI - thetaR)).toBeLessThan(EPS_ANGLE * RAD)
  })

  it('rayon réfléchi est unitaire', () => {
    expect(Math.abs(length(r) - 1)).toBeLessThan(EPS_VEC)
  })

  it('rayon réfléchi est dans le plan d\'incidence (2D : trivial)', () => {
    // En 2D le plan d'incidence est toujours le plan xOy.
    // On vérifie que le rayon réfléchi est bien dans l'espace 2D (toujours vrai)
    // et que la composante tangentielle est inversée correctement.
    // Composante tangentielle au miroir : t̂ = (1, 1)/√2
    const tangent = normalize({ x: 1, y: 1 })
    const dTangent = dot(d, tangent)
    const rTangent = dot(r, tangent)
    // La composante tangentielle est conservée lors d'une réflexion
    expect(Math.abs(dTangent - rTangent)).toBeLessThan(EPS_VEC)
  })
})

// ─── V2 : Réfraction air→verre 30° ──────────────────────────────────────────
//
// Scène : rayon à θ₁ = 30° dans l'air (n₁ = 1.0) pénètre dans du verre (n₂ = 1.5).
// Normale de la surface pointant vers l'air : (0, 1).
// Rayon incident : direction (sin30°, −cos30°) = (0.5, −√3/2).
// Attendu : θ₂ = arcsin(sin30°/1.5) = arcsin(1/3) ≈ 19.4712°.
// ─────────────────────────────────────────────────────────────────────────────
describe('V2 — Réfraction air→verre 30°', () => {
  const N1 = 1.0
  const N2 = 1.5
  const theta1 = 30 * DEG
  const d = normalize({ x: Math.sin(theta1), y: -Math.cos(theta1) })
  const n = { x: 0, y: 1 }   // normale de la surface (vers l'air = vers l'incident)

  const theta2_analytical = Math.asin(Math.sin(theta1) / N2) * RAD // ≈ 19.4712°

  it('refract retourne un vecteur non-null (pas de RTI)', () => {
    const t = refract(d, n, N1, N2)
    expect(t).not.toBeNull()
  })

  it(`θ₂ ≈ ${theta2_analytical.toFixed(4)}° (tolérance 1e-6 rad)`, () => {
    const t = refract(d, n, N1, N2)!
    // θ₂ est l'angle entre le rayon réfracté et la normale (côté transmission)
    const nT = { x: 0, y: -1 }    // normale côté transmission (opposée)
    const theta2_computed = incidenceAngle(t, nT) * RAD
    expect(Math.abs(theta2_computed - theta2_analytical)).toBeLessThan(EPS_ANGLE * RAD)
  })

  it('vérifie n₁·sinθ₁ = n₂·sinθ₂ (conservation de Snell)', () => {
    const t = refract(d, n, N1, N2)!
    const nT = { x: 0, y: -1 }
    const theta2 = incidenceAngle(t, nT)
    expect(Math.abs(N1 * Math.sin(theta1) - N2 * Math.sin(theta2))).toBeLessThan(EPS_ANGLE)
  })

  it('rayon réfracté est unitaire', () => {
    const t = refract(d, n, N1, N2)!
    expect(Math.abs(length(t) - 1)).toBeLessThan(EPS_VEC)
  })

  it('rayon réfracté va dans le sens de transmission (y < 0)', () => {
    const t = refract(d, n, N1, N2)!
    expect(t.y).toBeLessThan(0)
  })

  it('la composante x (tangentielle) est réduite par le facteur n₁/n₂', () => {
    // sin θ₂ / sin θ₁ = n₁/n₂ → la composante tangentielle est mise à l'échelle
    const t = refract(d, n, N1, N2)!
    expect(Math.abs(t.x / d.x - N1 / N2)).toBeLessThan(EPS_ANGLE)
  })
})

// ─── V3 : Réflexion totale interne verre→air 45° ────────────────────────────
//
// Scène : rayon à θ = 45° dans du verre (n₁ = 1.5) vers l'air (n₂ = 1.0).
// Angle critique θ_c = arcsin(1/1.5) ≈ 41.81°.
// θ = 45° > θ_c → réflexion totale interne.
// Attendu : refract retourne null.
// ─────────────────────────────────────────────────────────────────────────────
describe('V3 — Réflexion totale interne verre→air 45°', () => {
  const N1 = 1.5  // verre
  const N2 = 1.0  // air
  const theta = 45 * DEG
  const d = normalize({ x: Math.sin(theta), y: -Math.cos(theta) })
  const n = { x: 0, y: 1 }

  it('refract retourne null (réflexion totale interne)', () => {
    expect(refract(d, n, N1, N2)).toBeNull()
  })

  it('angle critique ≈ 41.81°', () => {
    const thetaC = criticalAngle(N1, N2)!
    expect(Math.abs(thetaC * RAD - 41.8103)).toBeLessThan(1e-3)
  })

  it('θ = 45° > θ_c', () => {
    const thetaC = criticalAngle(N1, N2)!
    expect(theta).toBeGreaterThan(thetaC)
  })

  it('juste en-dessous de θ_c : la réfraction fonctionne', () => {
    const thetaC = criticalAngle(N1, N2)!
    const dBelow = normalize({ x: Math.sin(thetaC - 0.001), y: -Math.cos(thetaC - 0.001) })
    expect(refract(dBelow, n, N1, N2)).not.toBeNull()
  })

  it('juste au-dessus de θ_c : réflexion totale', () => {
    const thetaC = criticalAngle(N1, N2)!
    const dAbove = normalize({ x: Math.sin(thetaC + 0.001), y: -Math.cos(thetaC + 0.001) })
    expect(refract(dAbove, n, N1, N2)).toBeNull()
  })

  it('incidence normale (θ = 0°) : toujours réfracté', () => {
    const dNormal = { x: 0, y: -1 }  // perpendiculaire à la surface
    expect(refract(dNormal, n, N1, N2)).not.toBeNull()
  })

  it('criticalAngle retourne null si n₁ ≤ n₂ (pas de RTI possible)', () => {
    expect(criticalAngle(1.0, 1.5)).toBeNull()  // air→verre
    expect(criticalAngle(1.0, 1.0)).toBeNull()  // même milieu
  })
})
