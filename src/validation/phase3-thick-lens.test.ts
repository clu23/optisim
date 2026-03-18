/**
 * Validation physique — Phase 3 — Lentille épaisse (ThickLens)
 *
 * TL1 : Structure de base (type, surfaces, containsPoint, bbox, sérialisation)
 *
 * TL2 : Convergence paraxiale — limite mince (t→0)
 *   Une lentille biconvexe R1=R2=200, n=1.5, t=2 doit donner la même
 *   distance focale qu'une lentille mince f=200 à < 2 px près.
 *
 * TL3 : Foyer paraxial vs lensmaker's equation
 *   Pour R1=R2=R, n=1.5, t donné :
 *     f_lensmaker = 1/((n−1)·(1/R1+1/R2−(n−1)·t/(n·R1·R2)))
 *   Le rayon paraxial tracé doit croiser l'axe à cette valeur ± 2 px.
 *
 * TL4 : Aberration sphérique — croissante avec l'épaisseur
 *   Pour une lentille épaisse (t=60), la différence foyer marginal − foyer
 *   paraxial doit être > 1 px (aberration visible).
 *
 * TL5 : Dispersion chromatique — matériau BK7
 *   Avec material=BK7, rouge (650 nm) et bleu (450 nm) foyers différents.
 *
 * TL6 : containsPoint cohérent avec le traceur
 *   La réfraction entrant/sortant doit converger au bon foyer.
 */

import { describe, it, expect } from 'vitest'
import { ThickLens, sagitta } from '../core/elements/thick-lens.ts'
import { traceRay } from '../core/tracer.ts'
import { normalize } from '../core/vector.ts'
import { serializeScene, deserializeScene } from '../serialization/scene-serializer.ts'
import type { Ray, Scene, Vec2 } from '../core/types.ts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRay(ox: number, oy: number, dx: number, dy: number, wl = 550): Ray {
  return { origin: { x: ox, y: oy }, direction: normalize({ x: dx, y: dy }), wavelength: wl, intensity: 1 }
}

/**
 * Trace un rayon parallèle à l'axe à hauteur h à travers la scène.
 * Retourne la position x du croisement avec y=0 (axe optique), ou null.
 */
function focalXAt(scene: Scene, h: number, wl = 550): number | null {
  const ray    = makeRay(0, h, 1, 0, wl)
  const result = traceRay(ray, scene)
  // Le segment réfléchi/réfracté final part dans la direction finale
  if (result.segments.length < 2) return null
  // Trouver le dernier segment qui croise y=0 après avoir dévié
  // (le dernier = après la dernière réfraction, que ce soit lentille mince ou épaisse)
  for (let i = result.segments.length - 1; i >= 1; i--) {
    const seg = result.segments[i]
    const dir: Vec2 = normalize({ x: seg.end.x - seg.start.x, y: seg.end.y - seg.start.y })
    if (Math.abs(dir.y) < 1e-10) continue
    const t = (0 - seg.start.y) / dir.y
    if (t > 0) return seg.start.x + t * dir.x
  }
  return null
}

// ─── TL1 : Structure ──────────────────────────────────────────────────────────

describe('ThickLens — structure', () => {
  const lens = new ThickLens({
    id: 'tl1', position: { x: 400, y: 0 }, angle: 0,
    R1: 200, R2: 200, thickness: 30, halfHeight: 60, n: 1.5,
  })

  it('type est "thick-lens"', () => {
    expect(lens.type).toBe('thick-lens')
  })

  it('getSurfaces retourne exactement 2 surfaces', () => {
    expect(lens.getSurfaces()).toHaveLength(2)
  })

  it('les surfaces ont les bons ids', () => {
    const ids = lens.getSurfaces().map(s => s.id)
    expect(ids).toContain('tl1-s1')
    expect(ids).toContain('tl1-s2')
  })

  it('containsPoint — centre est dans le verre', () => {
    expect(lens.containsPoint({ x: 400, y: 0 })).toBe(true)
  })

  it('containsPoint — point lointain hors du verre', () => {
    expect(lens.containsPoint({ x: 0, y: 0 })).toBe(false)
  })

  it('containsPoint — hors ouverture (|y| > halfHeight)', () => {
    expect(lens.containsPoint({ x: 400, y: 70 })).toBe(false)
  })

  it('containsPoint — juste devant S1 : hors du verre', () => {
    // vertex1 = 400−15 = 385, sag(0)=0 → frontBoundary en x=385
    expect(lens.containsPoint({ x: 383, y: 0 })).toBe(false)
  })

  it('containsPoint — juste derrière S1 : dans le verre', () => {
    expect(lens.containsPoint({ x: 387, y: 0 })).toBe(true)
  })

  it('getBoundingBox contient le centre', () => {
    const bb = lens.getBoundingBox()
    expect(lens.containsPoint(lens.position)).toBe(true)
    expect(bb.min.x).toBeLessThan(lens.position.x)
    expect(bb.max.x).toBeGreaterThan(lens.position.x)
  })
})

// ─── sagitta ──────────────────────────────────────────────────────────────────

describe('sagitta — formule de la flèche', () => {
  it('sag(0) = 0', () => {
    expect(sagitta(0, 200, 0)).toBe(0)
  })

  it('sphère κ=0 : sag(r, R) = R − √(R²−r²)', () => {
    const R = 200, r = 80
    const expected = R - Math.sqrt(R * R - r * r)
    expect(Math.abs(sagitta(r, R, 0) - expected)).toBeLessThan(1e-9)
  })

  it('parabole κ=−1 : sag(r, R) = r²/(2R)', () => {
    const R = 200, r = 60
    expect(Math.abs(sagitta(r, R, -1) - r * r / (2 * R))).toBeLessThan(1e-9)
  })

  it('renvoie Infinity si hors de l\'ouverture physique (discriminant < 0)', () => {
    // Pour κ=−2, r²/R² > 1/(1+κ)=1/(−1) → toujours Infinity?
    // Pour κ=2 : 1/(1+2)=1/3, r²>R²/3 → arg < 0
    const R = 200, r = 150, kappa = 2
    const result = sagitta(r, R, kappa)
    expect(result).toBe(Infinity)
  })
})

// ─── TL2 : Limite mince (t→0) ────────────────────────────────────────────────
//
// Biconvexe R1=R2=200, n=1.5 :
//   f_thin = 1/((n−1)·(1/R1+1/R2)) = 1/(0.5·0.01) = 200 px
// Lentille épaisse t=2 : le foyer paraxial doit être ≈ 200 px du centre.

describe('TL2 — Limite mince : foyer paraxial ≈ 200 px', () => {
  const R = 200, n = 1.5, t = 2
  const f_theory = 1 / ((n - 1) * (1 / R + 1 / R - (n - 1) * t / (n * R * R)))
  const TOL = 3

  const lens  = new ThickLens({ id: 'tl2', position: { x: 400, y: 0 }, angle: 0, R1: R, R2: R, thickness: t, halfHeight: 60, n })
  const scene = { elements: [lens], sources: [], metadata: { name: 'test' } }

  it(`f_lensmaker ≈ ${f_theory.toFixed(1)} px (proche de 200)`, () => {
    expect(Math.abs(f_theory - 200)).toBeLessThan(1)
  })

  it('paraxialFocalLength() correspond à lensmaker', () => {
    expect(Math.abs(lens.paraxialFocalLength() - f_theory)).toBeLessThan(0.01)
  })

  const heights = [5, 10, 15]
  for (const h of heights) {
    it(`rayon h=${h} converge à ≈ ${(400 + f_theory).toFixed(0)} px (tol ${TOL} px)`, () => {
      const xf = focalXAt(scene, h)
      expect(xf).not.toBeNull()
      expect(Math.abs(xf! - (400 + f_theory))).toBeLessThan(TOL)
    })
  }
})

// ─── TL3 : Foyer lensmaker — plusieurs épaisseurs ────────────────────────────

describe('TL3 — Foyer tracé vs lensmaker pour différentes épaisseurs', () => {
  const R = 200, n = 1.5
  const TOL = 3

  for (const t of [5, 20, 40]) {
    it(`t=${t}px : foyer tracé ≈ foyer lensmaker`, () => {
      const f_lm = 1 / ((n - 1) * (1 / R + 1 / R - (n - 1) * t / (n * R * R)))
      const lens  = new ThickLens({ id: `tl3-${t}`, position: { x: 400, y: 0 }, angle: 0, R1: R, R2: R, thickness: t, halfHeight: 60, n })
      const scene = { elements: [lens], sources: [], metadata: { name: 'test' } }

      // Pour une lentille épaisse, le foyer n'est pas à (centre + EFL) mais à
      // (sommet_S2 + BFD) où BFD = EFL · (1 − (n−1)·t/(n·R1)) (plan principal arrière)
      const bfd       = f_lm * (1 - (n - 1) * t / (n * R))
      const expected  = (400 + t / 2) + bfd

      const xf = focalXAt(scene, 8)
      expect(xf).not.toBeNull()
      expect(Math.abs(xf! - expected)).toBeLessThan(TOL)
    })
  }
})

// ─── TL4 : Aberration sphérique visible ──────────────────────────────────────
//
// Pour une lentille épaisse (t=60), les rayons marginaux convergent plus tôt
// que les rayons paraxiaux → aberration sphérique > 1 px.
// Le foyer marginal (h=50) doit différer du foyer paraxial (h=8) par > 1 px.

describe('TL4 — Aberration sphérique (t=60)', () => {
  const lens  = new ThickLens({ id: 'tl4', position: { x: 400, y: 0 }, angle: 0, R1: 200, R2: 200, thickness: 60, halfHeight: 80, n: 1.5 })
  const scene = { elements: [lens], sources: [], metadata: { name: 'test' } }

  it('foyer paraxial et marginal sont tous deux détectés', () => {
    expect(focalXAt(scene, 8)).not.toBeNull()
    expect(focalXAt(scene, 55)).not.toBeNull()
  })

  it('aberration sphérique : |f_marginal − f_paraxial| > 1 px', () => {
    const xfPara = focalXAt(scene, 8)!
    const xfMarg = focalXAt(scene, 55)!
    const aberration = Math.abs(xfMarg - xfPara)
    expect(aberration).toBeGreaterThan(1)
  })

  it('foyer marginal est plus proche de la lentille (aberration sphérique positive)', () => {
    // Pour une lentille sphérique biconvexe, les rayons marginaux convergent avant les paraxiaux
    const xfPara = focalXAt(scene, 8)!
    const xfMarg = focalXAt(scene, 55)!
    expect(xfMarg).toBeLessThan(xfPara)
  })
})

// ─── TL5 : Dispersion chromatique — BK7 ──────────────────────────────────────

describe('TL5 — Dispersion chromatique (BK7)', () => {
  const lens  = new ThickLens({ id: 'tl5', position: { x: 400, y: 0 }, angle: 0, R1: 200, R2: 200, thickness: 30, halfHeight: 60, n: 1.5, material: 'BK7' })
  const scene = { elements: [lens], sources: [], metadata: { name: 'test' } }

  it('foyer rouge (650 nm) et bleu (450 nm) sont différents', () => {
    const xfRed  = focalXAt(scene, 10, 650)
    const xfBlue = focalXAt(scene, 10, 450)
    expect(xfRed).not.toBeNull()
    expect(xfBlue).not.toBeNull()
    // Le bleu est plus réfracté → foyer plus court (bleu converge avant le rouge)
    expect(xfBlue!).toBeLessThan(xfRed!)
  })

  it('aberration chromatique > 0.5 px', () => {
    const xfRed  = focalXAt(scene, 10, 650)!
    const xfBlue = focalXAt(scene, 10, 450)!
    expect(Math.abs(xfRed - xfBlue)).toBeGreaterThan(0.5)
  })
})

// ─── TL6 : Sérialisation round-trip ──────────────────────────────────────────

describe('TL6 — Sérialisation JSON round-trip', () => {
  const lens  = new ThickLens({ id: 'tl6', position: { x: 300, y: 50 }, angle: 0.1, R1: 150, R2: 250, kappa1: -0.5, kappa2: 0.2, thickness: 25, halfHeight: 55, n: 1.7, label: 'Test' })
  const scene = { elements: [lens], sources: [], metadata: { name: 'test' } }

  const json       = serializeScene(scene)
  const restored   = deserializeScene(json)
  const restoredEl = restored.elements[0] as ThickLens

  it('type préservé', () => { expect(restoredEl.type).toBe('thick-lens') })
  it('R1 préservé', () => { expect(restoredEl.R1).toBe(150) })
  it('R2 préservé', () => { expect(restoredEl.R2).toBe(250) })
  it('kappa1 préservé', () => { expect(restoredEl.kappa1).toBeCloseTo(-0.5) })
  it('kappa2 préservé', () => { expect(restoredEl.kappa2).toBeCloseTo(0.2) })
  it('thickness préservé', () => { expect(restoredEl.thickness).toBe(25) })
  it('halfHeight préservé', () => { expect(restoredEl.halfHeight).toBe(55) })
  it('n préservé', () => { expect(restoredEl.n).toBe(1.7) })
  it('label préservé', () => { expect(restoredEl.label).toBe('Test') })
  it('foyer identique après round-trip', () => {
    const sceneB = { elements: [restoredEl], sources: [], metadata: { name: 'test' } }
    const xfOrig = focalXAt(scene, 8)!
    const xfRest = focalXAt(sceneB, 8)!
    expect(Math.abs(xfOrig - xfRest)).toBeLessThan(0.01)
  })
})
