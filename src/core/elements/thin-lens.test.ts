/**
 * Tests — ThinLens (core/elements/thin-lens.ts)
 *
 * Couvre :
 *  - Structure (type, surface, label, containsPoint)
 *  - Géométrie (endpoints, axisDirection, lensDirection, focalPoint)
 *  - BoundingBox
 *  - Intersection (frappe, manque, t>0, surfaceId)
 *  - deflect — lentille convergente (f > 0)
 *  - deflect — lentille divergente (f < 0)
 *  - V4 : faisceau parallèle, f=100, convergence exacte au foyer
 *
 * ─── Physique de la formule en pentes ────────────────────────────────────────
 *
 * La lentille mince applique la règle des pentes (formule exacte) :
 *   d⃗_out = normalize(d⃗_in − (h/f)·(d⃗_in·â)·l̂)
 *
 * Vérification analytique pour un rayon parallèle (d⃗_in = â = (1,0)) :
 *   d⃗_out = normalize((1,0) − (h/f)·(0,1)) = normalize((1, −h/f))
 *   Depuis (0, h) : croise y=0 à t = f·√(1+h²/f²),
 *   x_focus = f·√(1+h²/f²) / √(1+h²/f²) = f   ✓  (exact, ∀h)
 *
 * Vérification pour un rayon issu de F₁ = (−f, 0) vers (0, h) :
 *   d⃗_in = (f, h)/√(f²+h²),  (d⃗_in·â) = f/√(f²+h²)
 *   d⃗_out = normalize((f,h)/√(f²+h²) − (h/f)·(f/√(f²+h²))·(0,1))
 *          = normalize((f/√(f²+h²), 0)) = (1, 0)   ✓  (parallèle exact, ∀h)
 */

import { describe, it, expect } from 'vitest'
import { ThinLens, ThinLensSurface } from './thin-lens.ts'
import { normalize, dot, length, distance } from '../vector.ts'
import type { Vec2, Ray } from '../types.ts'

const EPS = 1e-9   // tolérance numérique (machine precision level)

function makeRay(ox: number, oy: number, dx: number, dy: number): Ray {
  return {
    origin: { x: ox, y: oy },
    direction: normalize({ x: dx, y: dy }),
    wavelength: 550,
    intensity: 1,
  }
}

/**
 * Coordonnée x où le rayon (origin, direction) croise la droite y = 0.
 * Fonctionne pour les foyers réels (t > 0) et virtuels (t < 0).
 */
function axisCrossX(origin: Vec2, direction: Vec2): number {
  // t tel que origin.y + t·direction.y = 0
  const t = -origin.y / direction.y
  return origin.x + t * direction.x
}

// ─── Structure ───────────────────────────────────────────────────────────────

describe('ThinLens — structure', () => {
  const lens = new ThinLens({ id: 'l1', position: { x: 0, y: 0 }, angle: 0, focalLength: 100, height: 200 })

  it('type est "thin-lens"', () => {
    expect(lens.type).toBe('thin-lens')
  })

  it('getSurfaces retourne exactement 1 surface', () => {
    expect(lens.getSurfaces()).toHaveLength(1)
  })

  it('la surface est une instance de ThinLensSurface', () => {
    expect(lens.getSurfaces()[0]).toBeInstanceOf(ThinLensSurface)
  })

  it('id de surface : "l1-surface"', () => {
    expect(lens.getSurfaces()[0].id).toBe('l1-surface')
  })

  it('label par défaut convergente : "Lentille convergente"', () => {
    expect(lens.label).toBe('Lentille convergente')
  })

  it('label par défaut divergente : "Lentille divergente"', () => {
    const d = new ThinLens({ id: 'x', position: { x: 0, y: 0 }, angle: 0, focalLength: -50, height: 100 })
    expect(d.label).toBe('Lentille divergente')
  })

  it('label personnalisé respecté', () => {
    const l = new ThinLens({ id: 'x', position: { x: 0, y: 0 }, angle: 0, focalLength: 100, height: 100, label: 'BK7' })
    expect(l.label).toBe('BK7')
  })

  it('containsPoint retourne toujours false (segment sans volume)', () => {
    expect(lens.containsPoint({ x: 0, y: 0 })).toBe(false)
    expect(lens.containsPoint({ x: 0, y: 50 })).toBe(false)
    expect(lens.containsPoint({ x: 1000, y: 1000 })).toBe(false)
  })
})

// ─── Géométrie ───────────────────────────────────────────────────────────────

describe('ThinLens — géométrie (angle = 0, height = 200)', () => {
  const lens = new ThinLens({ id: 'g1', position: { x: 0, y: 0 }, angle: 0, focalLength: 100, height: 200 })
  const [a, b] = lens.endpoints()

  it('extrémité A à (0, −100)', () => {
    expect(a.x).toBeCloseTo(0, 9)
    expect(a.y).toBeCloseTo(-100, 9)
  })

  it('extrémité B à (0, +100)', () => {
    expect(b.x).toBeCloseTo(0, 9)
    expect(b.y).toBeCloseTo(100, 9)
  })

  it('distance entre A et B = height = 200', () => {
    expect(Math.abs(distance(a, b) - 200)).toBeLessThan(EPS)
  })

  it('axisDirection = (1, 0) pour angle = 0', () => {
    const ax = lens.axisDirection()
    expect(ax.x).toBeCloseTo(1, 9)
    expect(ax.y).toBeCloseTo(0, 9)
  })

  it('lensDirection = (0, 1) pour angle = 0', () => {
    const ld = lens.lensDirection()
    expect(ld.x).toBeCloseTo(0, 9)
    expect(ld.y).toBeCloseTo(1, 9)
  })

  it('axisDirection ⊥ lensDirection', () => {
    expect(Math.abs(dot(lens.axisDirection(), lens.lensDirection()))).toBeLessThan(EPS)
  })

  it('focalPoint = (100, 0) pour f=100, position=(0,0)', () => {
    const fp = lens.focalPoint()
    expect(fp.x).toBeCloseTo(100, 9)
    expect(fp.y).toBeCloseTo(0, 9)
  })

  it('focalPoint divergente = (−50, 0) pour f=−50', () => {
    const d = new ThinLens({ id: 'x', position: { x: 0, y: 0 }, angle: 0, focalLength: -50, height: 100 })
    const fp = d.focalPoint()
    expect(fp.x).toBeCloseTo(-50, 9)
    expect(fp.y).toBeCloseTo(0, 9)
  })
})

describe('ThinLens — géométrie (angle = π/2, position = (30, 40))', () => {
  const lens = new ThinLens({ id: 'g2', position: { x: 30, y: 40 }, angle: Math.PI / 2, focalLength: 60, height: 100 })
  const [a, b] = lens.endpoints()

  it('distance AB = height après rotation', () => {
    expect(Math.abs(distance(a, b) - 100)).toBeLessThan(EPS)
  })

  it('axisDirection ≈ (0, 1) pour angle = π/2', () => {
    const ax = lens.axisDirection()
    expect(Math.abs(ax.x)).toBeLessThan(EPS)
    expect(ax.y).toBeCloseTo(1, 9)
  })

  it('lensDirection ≈ (−1, 0) pour angle = π/2', () => {
    const ld = lens.lensDirection()
    expect(ld.x).toBeCloseTo(-1, 9)
    expect(Math.abs(ld.y)).toBeLessThan(EPS)
  })

  it('focalPoint à (30, 40+60) = (30, 100) pour angle=π/2', () => {
    const fp = lens.focalPoint()
    expect(fp.x).toBeCloseTo(30, 9)
    expect(fp.y).toBeCloseTo(100, 9)
  })
})

// ─── BoundingBox ─────────────────────────────────────────────────────────────

describe('ThinLens — getBoundingBox', () => {
  const lens = new ThinLens({ id: 'bb1', position: { x: 0, y: 0 }, angle: 0, focalLength: 100, height: 200 })
  const bb = lens.getBoundingBox()
  const [a, b] = lens.endpoints()

  it('contient les deux extrémités', () => {
    for (const p of [a, b]) {
      expect(p.x).toBeGreaterThanOrEqual(bb.min.x)
      expect(p.x).toBeLessThanOrEqual(bb.max.x)
      expect(p.y).toBeGreaterThanOrEqual(bb.min.y)
      expect(p.y).toBeLessThanOrEqual(bb.max.y)
    }
  })

  it('a une marge positive au-delà des extrémités', () => {
    expect(bb.min.y).toBeLessThan(Math.min(a.y, b.y))
    expect(bb.max.y).toBeGreaterThan(Math.max(a.y, b.y))
  })
})

// ─── Intersection ────────────────────────────────────────────────────────────

describe('ThinLens — intersection', () => {
  const lens = new ThinLens({ id: 'i1', position: { x: 0, y: 0 }, angle: 0, focalLength: 100, height: 200 })
  const surface = lens.getSurfaces()[0] as ThinLensSurface

  it('rayon horizontal frappe la lentille au centre', () => {
    const ray = makeRay(-100, 0, 1, 0)
    const hit = surface.intersect(ray)
    expect(hit).not.toBeNull()
    expect(hit!.point.x).toBeCloseTo(0, 9)
    expect(hit!.point.y).toBeCloseTo(0, 9)
  })

  it('rayon horizontal frappe la lentille à h = 50', () => {
    const ray = makeRay(-100, 50, 1, 0)
    const hit = surface.intersect(ray)
    expect(hit).not.toBeNull()
    expect(hit!.point.y).toBeCloseTo(50, 6)
  })

  it('rayon hors ouverture (|h| > height/2) : pas d\'intersection', () => {
    const ray = makeRay(-100, 120, 1, 0)
    expect(surface.intersect(ray)).toBeNull()
  })

  it('t est positif', () => {
    const ray = makeRay(-100, 30, 1, 0)
    expect(surface.intersect(ray)!.t).toBeGreaterThan(0)
  })

  it('surfaceId correct', () => {
    const ray = makeRay(-100, 0, 1, 0)
    expect(surface.intersect(ray)!.surfaceId).toBe('i1-surface')
  })
})

// ─── Déviation — lentille convergente (f = 100) ──────────────────────────────

describe('ThinLens — deflect convergente f = 100', () => {
  const lens = new ThinLens({ id: 'd1', position: { x: 0, y: 0 }, angle: 0, focalLength: 100, height: 200 })
  const surface = lens.getSurfaces()[0] as ThinLensSurface
  const axis = { x: 1, y: 0 }

  it('h = 0 : aucune déviation (d_out = d_in)', () => {
    const dOut = surface.deflect(axis, { x: 0, y: 0 })
    expect(dOut.x).toBeCloseTo(1, 9)
    expect(dOut.y).toBeCloseTo(0, 9)
  })

  it('h > 0 : rayon dévié vers le bas (d_out.y < 0)', () => {
    const dOut = surface.deflect(axis, { x: 0, y: 50 })
    expect(dOut.y).toBeLessThan(0)
    expect(dOut.x).toBeGreaterThan(0)
  })

  it('h < 0 : rayon dévié vers le haut (d_out.y > 0)', () => {
    const dOut = surface.deflect(axis, { x: 0, y: -50 })
    expect(dOut.y).toBeGreaterThan(0)
    expect(dOut.x).toBeGreaterThan(0)
  })

  it('la direction de sortie est unitaire', () => {
    for (const h of [-50, -10, 0, 10, 50]) {
      const dOut = surface.deflect(axis, { x: 0, y: h })
      expect(Math.abs(length(dOut) - 1)).toBeLessThan(EPS)
    }
  })

  it('symétrie : deflect(h) et deflect(−h) sont symétriques', () => {
    const dPos = surface.deflect(axis, { x: 0, y: 40 })
    const dNeg = surface.deflect(axis, { x: 0, y: -40 })
    expect(dPos.x).toBeCloseTo(dNeg.x, 9)
    expect(dPos.y).toBeCloseTo(-dNeg.y, 9)
  })

  it('rayon issu de F₁ = (−100, 0) vers (0, h) sort parallèle (d_out.y = 0)', () => {
    const f = 100
    for (const h of [-60, -30, 30, 60]) {
      const dIn = normalize({ x: f, y: h })   // de (−f,0) vers (0,h)
      const dOut = surface.deflect(dIn, { x: 0, y: h })
      // Doit être parallèle à l'axe : d_out.y ≈ 0
      expect(Math.abs(dOut.y)).toBeLessThan(EPS)
      expect(dOut.x).toBeGreaterThan(0)
    }
  })
})

// ─── Déviation — lentille divergente (f = −100) ──────────────────────────────

describe('ThinLens — deflect divergente f = −100', () => {
  const lens = new ThinLens({ id: 'd2', position: { x: 0, y: 0 }, angle: 0, focalLength: -100, height: 200 })
  const surface = lens.getSurfaces()[0] as ThinLensSurface
  const axis = { x: 1, y: 0 }

  it('h > 0 : rayon dévié vers le haut (s\'éloigne de l\'axe)', () => {
    const dOut = surface.deflect(axis, { x: 0, y: 50 })
    expect(dOut.y).toBeGreaterThan(0)
  })

  it('h < 0 : rayon dévié vers le bas (s\'éloigne de l\'axe)', () => {
    const dOut = surface.deflect(axis, { x: 0, y: -50 })
    expect(dOut.y).toBeLessThan(0)
  })

  it('la direction de sortie est unitaire', () => {
    for (const h of [-50, 0, 50]) {
      expect(Math.abs(length(surface.deflect(axis, { x: 0, y: h })) - 1)).toBeLessThan(EPS)
    }
  })
})

// ─── V4 : faisceau parallèle, f = 100, convergence au foyer ─────────────────
//
// Scène : lentille convergente en (0, 0), angle=0, f=100, hauteur=200.
// Rayons incidents parallèles à l'axe (direction (1, 0)).
// Formule analytique : x_foyer = f = 100 exactement pour tout h.
//
// Validation :
//   ∀ h : |x_focus(h) − f| < 1e-9   (précision machine, formule exacte)
//
// Validation inverse :
//   Rayon issu de F₁ = (−100, 0) → parallèle après la lentille   (exact)
//
// Validation divergente :
//   f = −100 : foyer virtuel en x = f = −100   (extrapolation arrière)
// ─────────────────────────────────────────────────────────────────────────────

describe('V4 — faisceau parallèle converge au foyer f = 100', () => {
  const F = 100
  const lens = new ThinLens({ id: 'v4', position: { x: 0, y: 0 }, angle: 0, focalLength: F, height: 300 })
  const surface = lens.getSurfaces()[0] as ThinLensSurface

  // Hauteurs de test (non-nulles, variées, dont le cas SPECS.md h=50)
  const heights = [-80, -50, -20, 20, 50]

  it('SPECS.md V4 — h = 50, f = 100 : croise l\'axe exactement à x = 100', () => {
    const dOut = surface.deflect({ x: 1, y: 0 }, { x: 0, y: 50 })
    const xFocus = axisCrossX({ x: 0, y: 50 }, dOut)
    expect(Math.abs(xFocus - F)).toBeLessThan(EPS)
  })

  for (const h of heights) {
    it(`h = ${h} : x_foyer = ${F} (exact, tolérance 1e-9)`, () => {
      const dOut = surface.deflect({ x: 1, y: 0 }, { x: 0, y: h })
      // Le rayon converge vers l'axe (foyer réel, t > 0)
      const t = -h / dOut.y
      expect(t).toBeGreaterThan(0)
      const xFocus = axisCrossX({ x: 0, y: h }, dOut)
      expect(Math.abs(xFocus - F)).toBeLessThan(EPS)
    })
  }

  it('tous les foyers sont mutuellement identiques (dispersion < 1e-9)', () => {
    const foci = heights.map(h => {
      const dOut = surface.deflect({ x: 1, y: 0 }, { x: 0, y: h })
      return axisCrossX({ x: 0, y: h }, dOut)
    })
    const xMin = Math.min(...foci)
    const xMax = Math.max(...foci)
    expect(xMax - xMin).toBeLessThan(EPS)
  })

  it('rayon parallèle avec intersection via surface.intersect + deflect (pipeline complet)', () => {
    const ray = makeRay(-300, 50, 1, 0)
    const hit = surface.intersect(ray)!
    expect(hit).not.toBeNull()
    const dOut = surface.deflect(ray.direction, hit.point)
    const xFocus = axisCrossX(hit.point, dOut)
    expect(Math.abs(xFocus - F)).toBeLessThan(EPS)
  })
})

describe('V4 — source en F₁ → faisceau parallèle (lentille convergente)', () => {
  const F = 100
  const lens = new ThinLens({ id: 'v4b', position: { x: 0, y: 0 }, angle: 0, focalLength: F, height: 300 })
  const surface = lens.getSurfaces()[0] as ThinLensSurface

  const heights = [-70, -40, 40, 70]

  for (const h of heights) {
    it(`F₁ source h = ${h} : rayon sort parallèle (d_out.y ≈ 0)`, () => {
      // Rayon depuis F₁ = (−100, 0) vers la lentille à hauteur h
      const dIn = normalize({ x: F, y: h })   // de (−F, 0) vers (0, h)
      const dOut = surface.deflect(dIn, { x: 0, y: h })
      expect(Math.abs(dOut.y)).toBeLessThan(EPS)
      expect(dOut.x).toBeGreaterThan(0)
    })
  }
})

describe('V4 — lentille divergente f = −100 : foyer virtuel en x = −100', () => {
  const F = -100
  const lens = new ThinLens({ id: 'v4d', position: { x: 0, y: 0 }, angle: 0, focalLength: F, height: 300 })
  const surface = lens.getSurfaces()[0] as ThinLensSurface

  const heights = [-50, -20, 20, 50]

  for (const h of heights) {
    it(`h = ${h} : foyer virtuel à x = ${F} (extrapolation arrière)`, () => {
      const dOut = surface.deflect({ x: 1, y: 0 }, { x: 0, y: h })
      // Pour une lentille divergente, le foyer est virtuel (t < 0 → extrapolation)
      const xFocus = axisCrossX({ x: 0, y: h }, dOut)
      expect(Math.abs(xFocus - F)).toBeLessThan(EPS)
    })
  }
})

// ─── Symétrie gauche/droite ───────────────────────────────────────────────────
//
// Bug reproduit : un rayon parallèle venant de la DROITE (direction (−1,0))
// doit converger au foyer gauche F₁ = (−f, 0), symétrique de F₂.
//
// Avec la formule buguée axisComp = d⃗·â < 0 depuis la droite, le terme
// (h/f)·axisComp·l̂ change de signe → divergence au lieu de convergence.
//
// Correction : utiliser |axisComp| = |d⃗·â|.
// ─────────────────────────────────────────────────────────────────────────────

describe('Symétrie gauche/droite — bug convergence depuis la droite', () => {
  const F = 100
  const lens = new ThinLens({ id: 'sym', position: { x: 0, y: 0 }, angle: 0, focalLength: F, height: 300 })
  const surface = lens.getSurfaces()[0] as ThinLensSurface

  const heights = [-80, -50, -30, 30, 50, 80]

  // ── Rayon de droite : foyer gauche F₁ = (−f, 0) ──────────────────────────

  for (const h of heights) {
    it(`rayon de droite (−1,0) h=${h} : foyer gauche exactement à x = −f = ${-F}`, () => {
      const dOut = surface.deflect({ x: -1, y: 0 }, { x: 0, y: h })
      // axisCrossX trouve le croisement de la droite (0,h)+t·dOut avec y=0
      const xFocus = axisCrossX({ x: 0, y: h }, dOut)
      expect(Math.abs(xFocus - (-F))).toBeLessThan(EPS)
    })
  }

  // ── Égalité des distances focales des deux côtés ──────────────────────────

  for (const h of heights) {
    it(`distance focale : |f_gauche| = |f_droite| pour h = ${h}`, () => {
      const dLeft  = surface.deflect({ x:  1, y: 0 }, { x: 0, y: h })
      const dRight = surface.deflect({ x: -1, y: 0 }, { x: 0, y: h })
      const xLeft  = axisCrossX({ x: 0, y: h }, dLeft)   // doit valoir +F
      const xRight = axisCrossX({ x: 0, y: h }, dRight)  // doit valoir −F
      // Les deux distances au centre de la lentille doivent être identiques
      expect(Math.abs(Math.abs(xLeft) - Math.abs(xRight))).toBeLessThan(EPS)
    })
  }

  // ── Réversibilité optique ─────────────────────────────────────────────────
  //
  // Si d_in → d_out, alors −d_out doit redonner −d_in (renversement temporel).
  // Teste pour des rayons incident depuis les deux côtés.

  for (const h of [50, -50, 30]) {
    it(`réversibilité (de gauche) h=${h} : −d_out tracé → (−1, 0)`, () => {
      const dFwd = surface.deflect({ x: 1, y: 0 }, { x: 0, y: h })
      const dRev = surface.deflect({ x: -dFwd.x, y: -dFwd.y }, { x: 0, y: h })
      // Le retracé doit ressortir dans la direction opposée à l'original (−1, 0)
      expect(dRev.x).toBeCloseTo(-1, 9)
      expect(Math.abs(dRev.y)).toBeLessThan(EPS)
    })

    it(`réversibilité (de droite) h=${h} : −d_out tracé → (+1, 0)`, () => {
      const dFwd = surface.deflect({ x: -1, y: 0 }, { x: 0, y: h })
      const dRev = surface.deflect({ x: -dFwd.x, y: -dFwd.y }, { x: 0, y: h })
      expect(dRev.x).toBeCloseTo(1, 9)
      expect(Math.abs(dRev.y)).toBeLessThan(EPS)
    })
  }

  // ── Rayon depuis F₂ (côté droit) → ressort parallèle vers la gauche ──────

  for (const h of [40, -40, 60]) {
    it(`rayon de F₂=(+f,0) vers (0,${h}) → sort parallèle (d_out = (−1, 0))`, () => {
      // Direction de F₂=(100,0) vers le point (0, h) : normalize(−f, h)
      const dIn = normalize({ x: -F, y: h })
      const dOut = surface.deflect(dIn, { x: 0, y: h })
      // Le rayon sort parallèle à l'axe, vers la gauche
      expect(Math.abs(dOut.y)).toBeLessThan(EPS)
      expect(dOut.x).toBeLessThan(0)
    })
  }
})
