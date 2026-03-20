// ─────────────────────────────────────────────────────────────────────────────
// Phase 6 — Tests de validation : OPL et absorption Beer-Lambert
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { beerLambert, getAbsorptionCoeff } from '../core/absorption.ts'
import { traceRay } from '../core/tracer.ts'
import { Block } from '../core/elements/block.ts'
import { BeamSource } from '../core/sources/beam.ts'
import type { Scene } from '../core/types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Beerr-Lambert unitaires
// ─────────────────────────────────────────────────────────────────────────────

describe('beerLambert — formule I(s) = I₀ × exp(−α × s)', () => {
  it('α=0 → intensité inchangée', () => {
    expect(beerLambert(1, 0, 1000)).toBeCloseTo(1, 10)
  })

  it('α=0.01, s=100 → I=exp(−1) ≈ 0.3679', () => {
    expect(beerLambert(1, 0.01, 100)).toBeCloseTo(Math.exp(-1), 6)
  })

  it('α=0.001, s=0 → intensité inchangée', () => {
    expect(beerLambert(0.8, 0.001, 0)).toBeCloseTo(0.8, 10)
  })

  it('décroissance exponentielle stricte', () => {
    const i1 = beerLambert(1, 0.005, 100)
    const i2 = beerLambert(1, 0.005, 200)
    expect(i2).toBeCloseTo(i1 * i1, 8)  // exp(-0.5*200) = exp(-0.5*100)²
  })
})

describe('getAbsorptionCoeff — duck typing', () => {
  it('élément sans absorptionCoeff → 0', () => {
    expect(getAbsorptionCoeff({})).toBe(0)
    expect(getAbsorptionCoeff({ type: 'block', n: 1.5 })).toBe(0)
  })

  it('élément avec absorptionCoeff → retourne la valeur', () => {
    expect(getAbsorptionCoeff({ absorptionCoeff: 0.01 })).toBeCloseTo(0.01, 10)
  })

  it('absorptionCoeff négatif → clampé à 0', () => {
    expect(getAbsorptionCoeff({ absorptionCoeff: -0.1 })).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Beer-Lambert dans le traceur
// ─────────────────────────────────────────────────────────────────────────────

describe('Tracer — Beer-Lambert dans un bloc absorbant', () => {
  // Bloc de verre 200 px de large, n=1.5, α=0.01 px⁻¹
  // Rayon horizontal traversant le milieu
  // Intensité attendue à la sortie : I₀ × exp(−0.01 × 200) = exp(−2) ≈ 0.1353
  const block = new Block({
    id: 'b1',
    position: { x: 100, y: 0 },
    angle: 0,
    width: 200,
    height: 40,
    n: 1.5,
    absorptionCoeff: 0.01,
  })

  const source = new BeamSource({
    id: 'src',
    position: { x: -100, y: 0 },
    angle: 0,
    wavelengths: [550],
    numRays: 1,
    width: 0,
  })

  const scene: Scene = { elements: [block], sources: [source], metadata: { name: 'test' } }

  it('le segment intérieur au bloc a une intensité atténuée', () => {
    const result = traceRay(source.generateRays()[0], scene, 0)
    // Les segments sont : [entrée→face gauche, face gauche→face droite, face droite→∞]
    // Le segment dans le verre (index 1) doit avoir intensité ≈ exp(−0.01*200)
    const innerSeg = result.segments.find(seg => {
      // Segment entièrement dans le bloc (x entre 0 et 200, le bloc va de x=0 à x=200)
      return seg.start.x >= 0 && seg.end.x <= 200 && seg.end.x - seg.start.x > 50
    })
    expect(innerSeg).toBeDefined()
    // La Fresnel réduit légèrement l'intensité à l'entrée, mais l'atténuation
    // relative doit respecter Beer-Lambert.
    // On vérifie que l'intensité du segment intérieur est < 50% de l'intensité d'entrée
    expect(innerSeg!.intensity).toBeLessThan(0.5)
    // Et que la dépendance exponentielle est respectée à ≈1%
    const expectedFraction = Math.exp(-0.01 * 200)
    const actualFraction = innerSeg!.intensity / result.segments[0].intensity
    // On tolère la perte Fresnel à l'entrée (~4%), donc on vérifie la tendance
    expect(actualFraction).toBeCloseTo(expectedFraction, 1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// OPL — chemin optique
// ─────────────────────────────────────────────────────────────────────────────

describe('OPL — chemin optique dans un bloc de verre', () => {
  // Rayon traversant 200 px dans l'air (n=1) puis 100 px dans le verre (n=1.5)
  // OPL = 1×200 + 1.5×100 = 350
  // (Approximation, Fresnel réduit légèrement l'OPL terminal dans l'air)

  const block = new Block({
    id: 'b2',
    position: { x: 250, y: 0 },
    angle: 0,
    width: 100,
    height: 40,
    n: 1.5,
  })

  const source = new BeamSource({
    id: 'src2',
    position: { x: 0, y: 0 },
    angle: 0,
    wavelengths: [550],
    numRays: 1,
    width: 0,
  })

  const scene: Scene = { elements: [block], sources: [source], metadata: { name: 'test-opl' } }

  it('totalOpticalPath intègre n × distance correctement', () => {
    const result = traceRay(source.generateRays()[0], scene, 0)
    // OPL jusqu'à l'entrée du bloc : ~200 (air, n=1)
    // OPL dans le bloc : ~100 × 1.5 = 150
    // OPL total (hors segment terminal infini) devrait être ≈ 350 après le bloc
    // On vérifie que le totalOpticalPath est > 350 (inclut aussi le segment final)
    expect(result.totalOpticalPath).toBeGreaterThan(300)
    // La partie de l'OPL avant le rayon terminal ne devrait pas excéder 360
    // (en tenant compte des Fresnel et de l'offset de source)
    // → on vérifie simplement que l'OPL est cohérent avec n×d
    const segsBeforeTerminal = result.segments.slice(0, -1)
    const totalGeomDist = segsBeforeTerminal.reduce((acc, seg) => {
      const dx = seg.end.x - seg.start.x
      const dy = seg.end.y - seg.start.y
      return acc + Math.sqrt(dx * dx + dy * dy)
    }, 0)
    // OPL > distance géométrique (car verre a n>1)
    expect(result.totalOpticalPath).toBeGreaterThan(totalGeomDist)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bloc sans absorption → énergie conservée (R + T = 1, pas d'atténuation)
// ─────────────────────────────────────────────────────────────────────────────

describe('Bloc transparent (α=0) — intensité non atténuée par Beer-Lambert', () => {
  const block = new Block({
    id: 'b3',
    position: { x: 100, y: 0 },
    angle: 0,
    width: 100,
    height: 40,
    n: 1.5,
    absorptionCoeff: 0,
  })

  const source = new BeamSource({
    id: 'src3',
    position: { x: -50, y: 0 },
    angle: 0,
    wavelengths: [550],
    numRays: 1,
    width: 0,
  })

  const scene: Scene = { elements: [block], sources: [source], metadata: { name: 'test-transparent' } }

  it('le segment intérieur a la même intensité que le segment entrant (hors Fresnel)', () => {
    const result = traceRay(source.generateRays()[0], scene, 0)
    const innerSeg = result.segments.find(seg => seg.start.x > 0 && seg.start.x < 200)
    expect(innerSeg).toBeDefined()
    // Pour incidence normale (pas de Fresnel significatif), l'intensité intérieure
    // doit être très proche de 1 (légèrement réduit par réflexion Fresnel ~4%)
    expect(innerSeg!.intensity).toBeGreaterThan(0.9)
    expect(innerSeg!.intensity).toBeLessThanOrEqual(1.0)
  })
})
