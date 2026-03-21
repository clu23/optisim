/**
 * Validation physique — Phase 7D — Optimiseur mono-variable
 *
 * OP1  goldenSectionSearch — fonction quadratique f(x)=(x-3)² → min à x=3
 * OP2  goldenSectionSearch — sin² → min à π/2 sur [0, π]
 * OP3  optimizeScene — optimise focalLength d'une ThinLens pour RMS spot
 * OP4  optimizeScene — restaure la valeur originale après optimisation
 * OP5  makeRmsMetric — retourne Infinity si pas de plan image
 * OP6  goldenSectionSearch — convergence en moins de 50 itérations (ε=1e-4)
 */

import { describe, it, expect } from 'vitest'
import { goldenSectionSearch, optimizeScene, makeRmsMetric } from '../core/optimizer.ts'
import { ThinLens } from '../core/elements/thin-lens.ts'
import { ImagePlane } from '../core/elements/image-plane.ts'
import { BeamSource } from '../core/sources/beam.ts'
import type { Scene } from '../core/types.ts'

// ─── OP1 : Minimum quadratique ────────────────────────────────────────────

describe('OP1 — goldenSectionSearch — f(x)=(x-3)²', () => {
  it('trouve x ≈ 3 à ±1e-4', () => {
    const { x } = goldenSectionSearch(x => (x - 3) ** 2, 0, 10, 1e-6)
    expect(x).toBeCloseTo(3, 4)
  })

  it('fx ≈ 0 au minimum', () => {
    const { fx } = goldenSectionSearch(x => (x - 3) ** 2, 0, 10, 1e-6)
    expect(fx).toBeCloseTo(0, 8)
  })
})

// ─── OP2 : Minimum de (x-7)² ─────────────────────────────────────────────

describe('OP2 — goldenSectionSearch — f(x)=(x-7)² sur [2, 12]', () => {
  it('trouve x ≈ 7 à ±1e-4', () => {
    const { x } = goldenSectionSearch(x => (x - 7) ** 2, 2, 12, 1e-6)
    expect(x).toBeCloseTo(7, 4)
  })

  it('fx ≈ 0 au minimum', () => {
    const { fx } = goldenSectionSearch(x => (x - 7) ** 2, 2, 12, 1e-6)
    expect(fx).toBeCloseTo(0, 8)
  })
})

// ─── OP3 : optimizeScene — ThinLens + ImagePlane ─────────────────────────

describe('OP3 — optimiseScene réduit le RMS', () => {
  // Source parallèle : foyer à f depuis la lentille (x=0).
  // Plan image à x=150. Focal optimal = 150.
  // On part de f=250 (foyer à x=250, hors du plan image) → RMS non nul.
  function makeScene(f: number): Scene {
    const lens = new ThinLens({
      id: 'lens', position: { x: 0, y: 0 }, angle: 0,
      focalLength: f, height: 100, label: 'L',
    })
    const imagePlane = new ImagePlane({
      id: 'ip', position: { x: 150, y: 0 }, angle: 0, height: 200, label: 'Image',
    })
    const src = new BeamSource({
      id: 'beam', position: { x: -300, y: 0 }, angle: 0,
      wavelengths: [550], numRays: 5, width: 80, polarization: 'unpolarized',
    })
    return { elements: [lens, imagePlane], sources: [src], metadata: { name: 'test' } }
  }

  it('RMS initial non nul avec f=250 (foyer hors plan image)', () => {
    const scene = makeScene(250)
    const rmsInitial = makeRmsMetric('ip')(scene)
    expect(rmsInitial).toBeGreaterThan(1)
  })

  it('RMS optimal est inférieur au RMS initial (f=250 sub-optimal)', () => {
    const scene = makeScene(250)
    const metricFn = makeRmsMetric('ip')
    const rmsInitial = metricFn(scene)

    const result = optimizeScene(
      scene,
      { elementId: 'lens', property: 'focalLength', min: 50, max: 300 },
      metricFn,
    )

    expect(result.optimalMetric).toBeLessThan(rmsInitial)
  })

  it('optimalValue est dans la plage [50, 300]', () => {
    const scene = makeScene(250)
    const result = optimizeScene(
      scene,
      { elementId: 'lens', property: 'focalLength', min: 50, max: 300 },
      makeRmsMetric('ip'),
    )
    expect(result.optimalValue).toBeGreaterThanOrEqual(50)
    expect(result.optimalValue).toBeLessThanOrEqual(300)
  })
})

// ─── OP4 : La valeur originale est restaurée ──────────────────────────────

describe('OP4 — optimizeScene restaure la valeur originale', () => {
  const lens = new ThinLens({
    id: 'lens', position: { x: 0, y: 0 }, angle: 0,
    focalLength: 100, height: 100, label: 'L',
  })
  const ip = new ImagePlane({
    id: 'ip', position: { x: 200, y: 0 }, angle: 0, height: 200, label: 'Image',
  })
  const src = new BeamSource({
    id: 'beam', position: { x: -300, y: 0 }, angle: 0,
    wavelengths: [550], numRays: 3, width: 60, polarization: 'unpolarized',
  })
  const scene: Scene = { elements: [lens, ip], sources: [src], metadata: { name: 'test' } }

  it('focalLength == 100 après optimisation', () => {
    optimizeScene(
      scene,
      { elementId: 'lens', property: 'focalLength', min: 50, max: 300 },
      makeRmsMetric('ip'),
    )
    // Doit être restauré à 100 après l'optimisation
    expect(lens.focalLength).toBe(100)
  })
})

// ─── OP5 : makeRmsMetric sans plan image → Infinity ───────────────────────

describe('OP5 — makeRmsMetric sans plan image', () => {
  it('retourne Infinity si pas de plan image', () => {
    const scene: Scene = { elements: [], sources: [], metadata: { name: 'test' } }
    const m = makeRmsMetric('inexistant')
    expect(m(scene)).toBe(Infinity)
  })
})

// ─── OP6 : Convergence rapide ──────────────────────────────────────────────

describe('OP6 — goldenSectionSearch converge rapidement', () => {
  it('moins de 50 évaluations pour ε=1e-4 sur [0, 10]', () => {
    let count = 0
    goldenSectionSearch(x => { count++; return (x - 5) ** 2 }, 0, 10, 1e-4)
    // log_φ(10/1e-4) ≈ 26 itérations théoriques + quelques extras
    expect(count).toBeLessThan(50)
  })
})
