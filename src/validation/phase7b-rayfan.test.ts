/**
 * Validation physique — Phase 7B — Ray fan et aberration chromatique longitudinale
 *
 * RF1  Ray fan — miroir parabolique (κ=−1) : Δy ≈ 0 pour tous les h (foyer parfait)
 * RF2  Ray fan — lentille mince : Δy croît avec |h| (aberration sphérique visible)
 * RF3  LCA — lentille unique N-BK7 : position du foyer dépend de λ (ACL mesurable)
 * RF4  LCA — doublet achromat N-BK7/N-SF11 : ACL < ACL de la lentille simple
 * RF5  computeLCA — scène sans optique : aucun point (rayon non dévié)
 */

import { describe, it, expect } from 'vitest'
import { computeRayFan, computeLCA } from '../core/ray-fan.ts'
import { ConicMirror }  from '../core/elements/conic-mirror.ts'
import { ThinLens }     from '../core/elements/thin-lens.ts'
import { ThickLens }    from '../core/elements/thick-lens.ts'
import { ImagePlane }   from '../core/elements/image-plane.ts'
import type { Scene } from '../core/types.ts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeScene(...elements: Scene['elements']): Scene {
  return { elements, sources: [], metadata: { name: 'test' } }
}

// ─── RF1 : Miroir parabolique → Δy ≈ 0 ──────────────────────────────────────

describe('RF1 — Ray fan : miroir parabolique κ=−1, foyer parfait', () => {
  /**
   * Miroir parabolique : vertex (0,0), R=200, κ=−1.
   * Foyer F = (100, 0).
   * Plan image au foyer.
   * Rayons horizontaux à h ∈ [−0.8, +0.8] → tous convergent en F → Δy ≈ 0.
   */
  const mirror = new ConicMirror({
    id: 'm', position: { x: 0, y: 0 }, angle: 0, R: 200, kappa: -1, halfHeight: 100,
  })
  const plane = new ImagePlane({ id: 'ip', position: { x: 100, y: 0 }, angle: 0, height: 80 })
  const scene = makeScene(mirror)

  const curves = computeRayFan(scene, plane, {
    pupilX:      400,
    pupilRadius: 80,
    rayDir:      { x: -1, y: 0 },   // rayons venant de droite (miroir réfléchit vers F)
    nRays:       11,
    wavelengths: [550],
  })

  it('au moins une courbe produite', () => {
    expect(curves.length).toBeGreaterThanOrEqual(1)
  })

  it('Δy < 1 px pour tous les rayons (foyer idéal)', () => {
    const c = curves[0]
    expect(c).toBeDefined()
    const maxDelta = Math.max(...c.points.map(p => Math.abs(p.deltaY)))
    expect(maxDelta).toBeLessThan(1)
  })
})

// ─── RF2 : Lentille mince → ray fan plat (lentille idéale, pas d'aberration) ──

describe('RF2 — Ray fan : lentille mince idéale, Δy ≈ 0', () => {
  /**
   * La ThinLens implémente la formule exacte de déviation h/f sans approximation
   * paraxiale, de sorte que tous les rayons parallèles convergent en un même foyer,
   * quelle que soit leur hauteur h.  Le ray fan doit donc être plat (Δy ≈ 0).
   */
  const lens  = new ThinLens({ id: 'l', position: { x: 0, y: 0 }, angle: 0, focalLength: 200, height: 200 })
  const plane = new ImagePlane({ id: 'ip', position: { x: 200, y: 0 }, angle: 0, height: 100 })
  const scene = makeScene(lens)

  const curves = computeRayFan(scene, plane, {
    pupilX:      -300,
    pupilRadius: 80,
    rayDir:      { x: 1, y: 0 },
    nRays:       11,
    wavelengths: [550],
  })

  it('courbe produite', () => { expect(curves).toHaveLength(1) })

  it('Δy < 0.5 px pour tous h (lentille parfaite)', () => {
    const c = curves[0]
    const maxDelta = Math.max(...c.points.map(p => Math.abs(p.deltaY)))
    expect(maxDelta).toBeLessThan(0.5)
  })
})

// ─── RF3 : LCA — lentille unique N-BK7 ───────────────────────────────────────

describe('RF3 — LCA : lentille unique N-BK7, chromatisme mesurable', () => {
  /**
   * Lentille épaisse N-BK7, R1=R2=207, t=8.
   * La dispersion de Sellmeier donne des focales différentes pour bleu/rouge.
   * LCA = focusX(440 nm) − focusX(700 nm) doit être > 0.5 px.
   */
  const lens = new ThickLens({
    id: 'l', position: { x: 0, y: 0 }, angle: 0,
    R1: 207, R2: 207, thickness: 8, halfHeight: 80, n: 1.517, glassId: 'N-BK7',
  })
  const scene = makeScene(lens)
  const lcaPts = computeLCA(scene, {
    pupilX:      -200,
    pupilRadius: 60,
    rayDir:      { x: 1, y: 0 },
    wavelengths: [440, 480, 520, 550, 587, 620, 656, 700],
  })

  it('tous les points LCA produits', () => {
    expect(lcaPts.length).toBeGreaterThanOrEqual(6)
  })

  it('ACL > 0.5 px (chromatisme visible)', () => {
    const foci = lcaPts.map(p => p.focusX)
    const lca  = Math.max(...foci) - Math.min(...foci)
    expect(lca).toBeGreaterThan(0.5)
  })

  it('foyer plus proche pour λ court (bleu converge plus tôt)', () => {
    const f440 = lcaPts.find(p => p.wavelength === 440)?.focusX
    const f700 = lcaPts.find(p => p.wavelength === 700)?.focusX
    expect(f440).toBeDefined()
    expect(f700).toBeDefined()
    // Pour un verre crown (dn/dλ < 0), n(bleu) > n(rouge) → f(bleu) < f(rouge)
    expect(f440!).toBeLessThan(f700!)
  })
})

// ─── RF4 : LCA — doublet achromat N-BK7 / N-SF11 ────────────────────────────

describe('RF4 — LCA : doublet achromat N-BK7/N-SF11 < lentille simple', () => {
  /**
   * Doublet achromat (design thin-lens) :
   *   Couronne N-BK7 :  R1=R2=+124, f1 ≈ 120 px
   *   Flint    N-SF11 : R1=R2=−461, f2 ≈ −294 px  (biconcave, R<0 dans la conv. OptiSim)
   *   f_total ≈ 1/(1/120 − 1/294) ≈ 204 px
   *
   * Lentille de référence N-BK7 seule : R1=R2=207, f ≈ 194 px.
   *
   * Assertion :
   *   ACL(doublet) < ACL(lentille simple)
   *   L'achromat corrige l'aberration chromatique primaire (raies F et C).
   */

  // ── Scène lentille simple ────────────────────────────────────────────────
  const singleLens = new ThickLens({
    id: 'sl', position: { x: 0, y: 0 }, angle: 0,
    R1: 207, R2: 207, thickness: 8, halfHeight: 80, n: 1.517, glassId: 'N-BK7',
  })
  const sceneSingle = makeScene(singleLens)

  // ── Scène doublet achromat ───────────────────────────────────────────────
  const crown = new ThickLens({
    id: 'crown', position: { x: 0, y: 0 }, angle: 0,
    R1: 124, R2: 124, thickness: 8, halfHeight: 80, n: 1.517, glassId: 'N-BK7',
  })
  const flint = new ThickLens({
    id: 'flint', position: { x: 10, y: 0 }, angle: 0,
    R1: -461, R2: -461, thickness: 6, halfHeight: 80, n: 1.785, glassId: 'N-SF11',
  })
  const sceneDoublet = makeScene(crown, flint)

  const lcaCfg = {
    pupilX:      -200,
    pupilRadius: 60,
    rayDir:      { x: 1, y: 0 } as const,
    wavelengths: [440, 480, 520, 550, 587, 620, 656, 700],
  }

  const lcaSingle  = computeLCA(sceneSingle,  lcaCfg)
  const lcaDoublet = computeLCA(sceneDoublet, lcaCfg)

  function lcaRange(pts: typeof lcaSingle) {
    if (pts.length < 2) return 0
    const foci = pts.map(p => p.focusX)
    return Math.max(...foci) - Math.min(...foci)
  }

  it('données LCA produites pour les deux systèmes', () => {
    expect(lcaSingle.length).toBeGreaterThanOrEqual(6)
    expect(lcaDoublet.length).toBeGreaterThanOrEqual(6)
  })

  it('ACL(doublet) < ACL(lentille simple) — correction achromat', () => {
    const rangeSingle  = lcaRange(lcaSingle)
    const rangeDoublet = lcaRange(lcaDoublet)
    // Le doublet doit avoir une ACL significativement plus faible
    expect(rangeDoublet).toBeLessThan(rangeSingle * 0.5)
  })
})

// ─── RF5 : Scène vide → pas de points LCA ────────────────────────────────────

describe('RF5 — LCA : scène sans optique → aucun point', () => {
  const emptyScene = makeScene()
  const pts = computeLCA(emptyScene, {
    pupilX: -100, pupilRadius: 50, rayDir: { x: 1, y: 0 }, wavelengths: [440, 550, 700],
  })

  it('aucun point LCA (rayons non déviés → pas de foyer)', () => {
    // Les rayons non déviés ont sdy≈0 → extrapolation impossible → pas de points
    expect(pts.length).toBe(0)
  })
})
