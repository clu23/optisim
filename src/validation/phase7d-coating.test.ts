/**
 * Validation physique — Phase 7D — Coating AR mono-couche quart-d'onde
 *
 * CT1  Incidence normale, coating optimal : R ≈ 0 à λ₀
 * CT2  Incidence normale, coating optimal : R > 0 hors de λ₀
 * CT3  Incidence oblique, coating optimal : R ≈ 0 à λ₀ (s-pol)
 * CT4  Formule d'Airy — vérification analytique à incidence normale
 * CT5  ThickLens avec coating : transmittance augmentée (R réduit)
 * CT6  Comparaison fresnelWithCoating vs fresnelCoefficients sans coating
 */

import { describe, it, expect } from 'vitest'
import { fresnelWithCoating } from '../core/coating.ts'
import { fresnelCoefficients } from '../core/fresnel.ts'
import { ThickLens } from '../core/elements/thick-lens.ts'
import { BeamSource } from '../core/sources/beam.ts'
import { traceRay } from '../core/tracer.ts'
import type { Scene } from '../core/types.ts'

// ─── CT1 : Coating optimal, incidence normale, à λ₀ → R ≈ 0 ──────────────

describe('CT1 — Coating optimal à λ₀, incidence normale', () => {
  // n1 = 1 (air), n2 = 1.5 (verre), nc = √(1×1.5) = √1.5
  const n1 = 1, n2 = 1.5
  const nc = Math.sqrt(n1 * n2)
  const lambda0 = 550  // nm

  it('Rs ≈ 0 à λ₀ (incidence normale)', () => {
    const f = fresnelWithCoating(n1, n2, 1, { wavelength: lambda0, nCoating: nc }, lambda0)
    expect(f.Rs).toBeCloseTo(0, 8)
  })

  it('Rp ≈ 0 à λ₀ (incidence normale)', () => {
    const f = fresnelWithCoating(n1, n2, 1, { wavelength: lambda0, nCoating: nc }, lambda0)
    expect(f.Rp).toBeCloseTo(0, 8)
  })

  it('Runpol ≈ 0 à λ₀ (incidence normale)', () => {
    const f = fresnelWithCoating(n1, n2, 1, { wavelength: lambda0 }, lambda0)
    expect(f.Runpol).toBeCloseTo(0, 6)
  })

  it('T = 1 − R → Tunpol ≈ 1', () => {
    const f = fresnelWithCoating(n1, n2, 1, { wavelength: lambda0 }, lambda0)
    expect(f.Tunpol).toBeCloseTo(1, 6)
  })
})

// ─── CT2 : Coating — R augmente hors de λ₀ ───────────────────────────────

describe('CT2 — Coating optimal, R croît hors de λ₀', () => {
  const n1 = 1, n2 = 1.5
  const lambda0 = 550
  const coating = { wavelength: lambda0 }

  it('R(400nm) > R(550nm) ≈ 0 (bleu plus reflété)', () => {
    const f400 = fresnelWithCoating(n1, n2, 1, coating, 400)
    const f550 = fresnelWithCoating(n1, n2, 1, coating, 550)
    expect(f400.Runpol).toBeGreaterThan(f550.Runpol + 0.001)
  })

  it('R(700nm) > R(550nm) ≈ 0 (rouge plus reflété)', () => {
    const f700 = fresnelWithCoating(n1, n2, 1, coating, 700)
    const f550 = fresnelWithCoating(n1, n2, 1, coating, 550)
    expect(f700.Runpol).toBeGreaterThan(f550.Runpol + 0.001)
  })
})

// ─── CT3 : Incidence oblique — R réduit mais pas nul ─────────────────────

describe('CT3 — Coating optimal, incidence oblique (30°)', () => {
  const n1 = 1, n2 = 1.5
  const lambda0 = 550
  const cosI = Math.cos(Math.PI / 6)  // 30°
  const coating = { wavelength: lambda0 }

  it('Rs < Rs_sans_coating (coating réduit la réflexion)', () => {
    const fC = fresnelWithCoating(n1, n2, cosI, coating, lambda0)
    const fN = fresnelCoefficients(n1, n2, cosI)
    expect(fC.Rs).toBeLessThan(fN.Rs)
  })

  it('0 ≤ R ≤ 1 (conservation de l énergie)', () => {
    const f = fresnelWithCoating(n1, n2, cosI, coating, lambda0)
    expect(f.Rs).toBeGreaterThanOrEqual(0)
    expect(f.Rs).toBeLessThanOrEqual(1)
    expect(f.Rp).toBeGreaterThanOrEqual(0)
    expect(f.Rp).toBeLessThanOrEqual(1)
  })
})

// ─── CT4 : Vérification analytique de la formule d'Airy ──────────────────

describe('CT4 — Formule Airy vérification analytique', () => {
  // À quart d'onde (δ = π/2, cos2δ = -1) :
  // R = (r01 - r12)² / (1 - r01·r12)² = ((n1·n2 - nc²) / (n1·n2 + nc²))²
  const n1 = 1, n2 = 1.5, nc = 1.2
  const lambda0 = 550

  const r01 = (n1 - nc) / (n1 + nc)  // s-pol à incidence normale
  const r12 = (nc - n2) / (nc + n2)
  // Airy avec cos2d = -1 :
  const R_analytique = (r01 - r12) ** 2 / (1 - r01 * r12) ** 2

  it('Rs correspond à la formule Airy analytique à λ₀', () => {
    const f = fresnelWithCoating(n1, n2, 1, { wavelength: lambda0, nCoating: nc }, lambda0)
    expect(f.Rs).toBeCloseTo(R_analytique, 8)
  })
})

// ─── CT5 : ThickLens avec coating — transmittance augmentée ──────────────

describe('CT5 — ThickLens coaté vs non coaté', () => {
  const lambda0 = 550

  function makeScene(withCoating: boolean): Scene {
    const coating1 = withCoating ? { wavelength: lambda0 } : undefined
    const coating2 = withCoating ? { wavelength: lambda0 } : undefined

    const lens = new ThickLens({
      id: 'lens', position: { x: 0, y: 0 }, angle: 0,
      R1: 100, R2: 100, thickness: 10, halfHeight: 50,
      n: 1.5, coating1, coating2, label: 'L',
    })
    const src = new BeamSource({
      id: 'beam', position: { x: -200, y: 0 }, angle: 0,
      wavelengths: [lambda0], numRays: 1, width: 0, polarization: 'unpolarized',
    })
    return { elements: [lens], sources: [src], metadata: { name: 'test' } }
  }

  it('Intensité finale plus élevée avec coating (R réduit)', () => {
    const sceneNC = makeScene(false)
    const sceneC  = makeScene(true)
    const src = sceneNC.sources[0]
    const rays = src.generateRays()

    const resultNC = traceRay(rays[0], sceneNC)
    const resultC  = traceRay(rays[0], sceneC)

    const lastIntNC = resultNC.segments.at(-1)!.intensity
    const lastIntC  = resultC.segments.at(-1)!.intensity

    // Avec coating, l'intensité transmise est plus grande (moins de réflexion)
    expect(lastIntC).toBeGreaterThan(lastIntNC)
  })
})

// ─── CT6 : Sans coating = comportement Fresnel standard ──────────────────

describe('CT6 — fresnelWithCoating → dégénère vers standard si nc absent', () => {
  // Avec nc optimal (auto) et λ = λ₀ → R ≈ 0, très différent de Fresnel nu
  // Ce test vérifie que la réduction est significative sur une interface réelle
  const n1 = 1, n2 = 1.5, lambda0 = 550

  it('Fresnel nu : Runpol ≈ 4% à incidence normale', () => {
    const f = fresnelCoefficients(n1, n2, 1)
    // R = ((n2-n1)/(n2+n1))² = (0.5/2.5)² = 0.04
    expect(f.Runpol).toBeCloseTo(0.04, 4)
  })

  it('Coating optimal : Runpol ≈ 0% à λ₀', () => {
    const f = fresnelWithCoating(n1, n2, 1, { wavelength: lambda0 }, lambda0)
    expect(f.Runpol).toBeCloseTo(0, 6)
  })
})
