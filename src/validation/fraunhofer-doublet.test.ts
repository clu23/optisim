/**
 * Validation physique — Doublet de Fraunhofer f/4
 *
 * Design optimisé pour la condition de Fraunhofer (φ₁/ν₁ + φ₂/ν₂ = 0) :
 *   N-BK7  : R1=+61.47mm, R2_TL=+62.3mm (R2_std=−62.3mm), t=6mm, f₁≈59.9mm
 *   N-SF11 : R1=+5000mm (≈plat), R2_TL=−117.1mm (R2_std=+117.1mm), t=2mm, f₂≈−149.1mm
 *   Gap de 1mm entre les deux éléments.
 *   f_total ≈ 100mm,  φ₁/ν₁ + φ₂/ν₂ ≈ 0.
 *
 * FD1  Prescription — 4 surfaces refractives, nD et Abbe corrects
 * FD2  LCA (F-line / C-line) — aberration chromatique < 0.5mm
 * FD3  Focale effective (BFD d-line) — entre 85mm et 115mm
 * FD4  RMS spot monochromatique (587nm) au foyer paraxial — < 0.25mm (aberration sphérique géométrique f/4)
 * FD5  Condition de Fraunhofer — LCA(doublet) < LCA(BK7 seul)
 */

import { describe, it, expect } from 'vitest'
import { buildPrescription }    from '../core/prescription.ts'
import { computeLCA }           from '../core/ray-fan.ts'
import { collectSpots }         from '../core/spot-diagram.ts'
import { traceRay }             from '../core/tracer.ts'
import { ThickLens }            from '../core/elements/thick-lens.ts'
import { ApertureElement }      from '../core/elements/aperture.ts'
import { ImagePlane }           from '../core/elements/image-plane.ts'
import { LAMBDA_D, LAMBDA_F, LAMBDA_C } from '../core/glass-catalog.ts'
import type { Ray, Scene, TraceResult } from '../core/types.ts'

// ─── Configuration du doublet ─────────────────────────────────────────────────
//
// Coordonnées scène : BK7 centré en x=0, propagation vers +x.
//   vertex1(BK7) = −3  vertex2(BK7) = +3
//   vertex1(SF11) = +3  vertex2(SF11) = +5
//   Pupille fictive en x = −100 pour les calculs LCA/RMS.
//
const HALF_H  = 12.5   // Demi-ouverture 25mm/2 (mm)
const T1      = 6      // Épaisseur BK7 (mm)
const T2      = 2      // Épaisseur SF11 (mm)
const GAP     = 1      // Gap air entre BK7 et SF11 (mm)
const V2_SF11 = T1 / 2 + GAP + T2   // = 3+1+2 = 6 (vertex2 SF11 depuis centre BK7)
const PUPIL_X = -100   // Position de la pupille fictive (mm)

// ─── Éléments optiques ───────────────────────────────────────────────────────
// Design Fraunhofer : φ₁/ν₁ + φ₂/ν₂ = 0
//   BK7  : R1=61.47, R2_TL=62.3 (quasi-symétrique), f₁≈59.9mm
//   SF11 : R1=5000 (≈plat), R2_TL=−117.1 (plano-concave), f₂≈−149.1mm

const bk7 = new ThickLens({
  id: 'bk7', label: 'N-BK7',
  position: { x: 0, y: 0 }, angle: 0,
  R1: 61.47, R2: 62.3,
  kappa1: 0, kappa2: 0,
  thickness: T1, halfHeight: HALF_H,
  n: 1.5168, glassId: 'N-BK7',
})

const sf11 = new ThickLens({
  id: 'sf11', label: 'N-SF11',
  position: { x: T1 / 2 + GAP + T2 / 2, y: 0 }, angle: 0,   // centre = 5mm
  R1: 5000, R2: -117.1,
  kappa1: 0, kappa2: 0,
  thickness: T2, halfHeight: HALF_H,
  n: 1.7847, glassId: 'N-SF11',
})

const aperture = new ApertureElement({
  id: 'stop', label: 'Diaphragme',
  position: { x: -T1 / 2 - 2, y: 0 }, angle: 0,
  diameter: 28, clearRadius: HALF_H,
})

function makeScene(...elements: Scene['elements']): Scene {
  return { elements, sources: [], metadata: { name: 'test' } }
}

const doubletScene = makeScene(aperture, bk7, sf11)

// Config LCA commune
const lcaCfg = {
  pupilX:      PUPIL_X,
  pupilRadius: HALF_H,
  rayDir:      { x: 1, y: 0 },
  wavelengths: [LAMBDA_F, LAMBDA_D, LAMBDA_C],
}

// ─── FD1 : Prescription — structure et verres ─────────────────────────────────

describe('FD1 — Prescription : 4 surfaces refractives avec nD et Abbe corrects', () => {
  const table = buildPrescription(makeScene(bk7, sf11))

  it('4 lignes (2 par lentille épaisse)', () => {
    expect(table.rows).toHaveLength(4)
  })

  it('S1 BK7 — R1_std = +61.47mm', () => {
    const r = table.rows[0]
    expect(r.radius).toBeCloseTo(61.47, 2)
    expect(r.type).toBe('refract')
  })

  it('S2 BK7 — R2_std = −62.3mm (convention standard, R2_TL=+62.3)', () => {
    const r = table.rows[1]
    expect(r.radius).toBeCloseTo(-62.3, 1)
  })

  it('S3 SF11 — R1_std ≈ +5000mm (quasi-plat)', () => {
    const r = table.rows[2]
    expect(Math.abs(r.radius)).toBeGreaterThan(1000)
  })

  it('S4 SF11 — R2_std = +117.1mm (concave, R2_TL=−117.1)', () => {
    const r = table.rows[3]
    expect(r.radius).toBeCloseTo(117.1, 1)
    expect(r.material).toBe('AIR')
  })

  it('BK7 — nD ≈ 1.5168, νD ≈ 64 (crown)', () => {
    const r = table.rows[0]
    expect(r.nD).toBeCloseTo(1.5168, 3)
    expect(r.abbeNumber).not.toBeNull()
    expect(r.abbeNumber!).toBeGreaterThan(60)
  })

  it('SF11 — nD ≈ 1.7847, νD ≈ 25 (flint)', () => {
    const r = table.rows[2]
    expect(r.nD).toBeCloseTo(1.7847, 3)
    expect(r.abbeNumber).not.toBeNull()
    expect(r.abbeNumber!).toBeLessThan(30)
  })
})

// ─── FD2 : LCA (F-line / C-line) < 0.5mm ─────────────────────────────────────

describe('FD2 — LCA : aberration chromatique longitudinale < 0.5mm', () => {
  const lcaPts = computeLCA(doubletScene, lcaCfg)

  it('3 points LCA produits (F, d, C)', () => {
    expect(lcaPts).toHaveLength(3)
  })

  it('LCA(486nm → 656nm) < 0.5mm (achromatisation de Fraunhofer)', () => {
    const focF = lcaPts.find(p => Math.abs(p.wavelength - LAMBDA_F) < 1)?.focusX
    const focC = lcaPts.find(p => Math.abs(p.wavelength - LAMBDA_C) < 1)?.focusX
    expect(focF).toBeDefined()
    expect(focC).toBeDefined()
    const lca = Math.abs(focF! - focC!)
    expect(lca).toBeLessThan(0.5)
  })
})

// ─── FD3 : Focale effective — BFD mesurée à la raie d ────────────────────────

describe('FD3 — Focale effective : BFD entre 80mm et 160mm à λ=587nm', () => {
  const lcaPts = computeLCA(doubletScene, lcaCfg)
  const focD   = lcaPts.find(p => Math.abs(p.wavelength - LAMBDA_D) < 1)?.focusX

  it('foyer d-line trouvé', () => {
    expect(focD).toBeDefined()
    expect(isFinite(focD!)).toBe(true)
  })

  it('BFD (vertex2_SF11 → foyer) dans [85, 115] mm', () => {
    const bfd = focD! - V2_SF11
    expect(bfd).toBeGreaterThan(85)
    expect(bfd).toBeLessThan(115)
  })
})

// ─── FD4 : RMS spot < 0.05mm au foyer paraxial (monochromatique) ─────────────

describe('FD4 — RMS spot monochromatique (587nm) au foyer paraxial < 0.25mm', () => {
  // 1. Trouver le foyer paraxial à λ=587nm
  const lcaPts = computeLCA(doubletScene, lcaCfg)
  const focD   = lcaPts.find(p => Math.abs(p.wavelength - LAMBDA_D) < 1)?.focusX ?? (V2_SF11 + 110)

  // 2. Plan image au foyer paraxial
  const plane = new ImagePlane({
    id: 'ip', position: { x: focD, y: 0 }, angle: 0, height: 1,
  })

  // 3. Tracer 9 rayons parallèles à λ=587nm, répartis sur ±12.5mm
  const nRays = 9
  const heights = Array.from({ length: nRays }, (_, i) =>
    -HALF_H + (2 * HALF_H * i) / (nRays - 1),
  )

  const results: TraceResult[] = heights.map(hy => {
    const ray: Ray = {
      origin:    { x: PUPIL_X, y: hy },
      direction: { x: 1, y: 0 },
      wavelength: LAMBDA_D,
      intensity:  1,
    }
    return traceRay(ray, doubletScene)
  })

  const spots = collectSpots(plane, results)

  it('au moins 7 spots collectés (rayons passant l\'ouverture)', () => {
    expect(spots.points.length).toBeGreaterThanOrEqual(7)
  })

  it('RMS spot < 0.25mm (aberration sphérique géométrique f/4 plein champ)', () => {
    expect(spots.rmsRadius).toBeLessThan(0.25)
  })
})

// ─── FD5 : Condition de Fraunhofer — LCA doublet < LCA lentille simple ────────

describe('FD5 — Fraunhofer : LCA(doublet) < LCA(BK7 seul)', () => {
  // Lentille BK7 seule (même design, f≈60mm)
  const bk7Only = new ThickLens({
    id: 'bk7only', label: 'N-BK7 seul',
    position: { x: 0, y: 0 }, angle: 0,
    R1: 61.47, R2: 62.3,
    kappa1: 0, kappa2: 0,
    thickness: T1, halfHeight: HALF_H,
    n: 1.5168, glassId: 'N-BK7',
  })

  const singleScene = makeScene(bk7Only)
  const singleLca   = computeLCA(singleScene, { ...lcaCfg, wavelengths: [LAMBDA_F, LAMBDA_C] })
  const doubletLca  = computeLCA(doubletScene, { ...lcaCfg, wavelengths: [LAMBDA_F, LAMBDA_C] })

  function spread(pts: typeof singleLca): number {
    if (pts.length < 2) return Infinity
    return Math.abs(pts[pts.length - 1].focusX - pts[0].focusX)
  }

  it('LCA du doublet < LCA de la lentille seule', () => {
    const lcaSingle  = spread(singleLca)
    const lcaDoublet = spread(doubletLca)
    expect(lcaDoublet).toBeLessThan(lcaSingle)
  })
})
