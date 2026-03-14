/**
 * Tests — FlatMirror (core/elements/flat-mirror.ts)
 *
 * Couvre :
 *  - Structure de l'élément (getSurfaces, getBoundingBox, containsPoint)
 *  - Intersection géométrique (segment touché / manqué / rayon parallèle)
 *  - V1 : Réflexion miroir plan 45° — θ_r = θ_i = 45°, rayon réfléchi = (0, 1)
 */

import { describe, it, expect } from 'vitest'
import { FlatMirror } from './flat-mirror.ts'
import { reflect, incidenceAngle } from '../optics.ts'
import { length, normalize } from '../vector.ts'

const RAD = 180 / Math.PI
const EPS = 1e-6

// Rayon de test minimal
function makeRay(ox: number, oy: number, dx: number, dy: number) {
  return {
    origin: { x: ox, y: oy },
    direction: normalize({ x: dx, y: dy }),
    wavelength: 550,
    intensity: 1,
  }
}

// ─── Structure de l'élément ──────────────────────────────────────────────────

describe('FlatMirror — structure', () => {
  const mirror = new FlatMirror({
    id: 'm1',
    position: { x: 0, y: 0 },
    angle: 0,             // Horizontal
    length: 100,
    label: 'Test',
  })

  it('type est "flat-mirror"', () => {
    expect(mirror.type).toBe('flat-mirror')
  })

  it('getSurfaces retourne exactement 1 surface', () => {
    expect(mirror.getSurfaces()).toHaveLength(1)
  })

  it('la surface a le bon id', () => {
    expect(mirror.getSurfaces()[0].id).toBe('m1-surface')
  })

  it('getBoundingBox enveloppe le segment', () => {
    // Miroir horizontal de longueur 100 centré en (0, 0) : x ∈ [−50, 50]
    const bb = mirror.getBoundingBox()
    expect(bb.min.x).toBeLessThanOrEqual(-50)
    expect(bb.max.x).toBeGreaterThanOrEqual(50)
  })

  it('containsPoint — centre toujours inclus', () => {
    expect(mirror.containsPoint({ x: 0, y: 0 })).toBe(true)
  })

  it('containsPoint — point loin exclu', () => {
    expect(mirror.containsPoint({ x: 1000, y: 1000 })).toBe(false)
  })
})

// ─── Intersection géométrique ────────────────────────────────────────────────

describe('FlatMirror — intersection', () => {
  // Miroir vertical de longueur 100 centré en (50, 0) : segment (50, -50)→(50, 50)
  const mirror = new FlatMirror({
    id: 'm2',
    position: { x: 50, y: 0 },
    angle: Math.PI / 2,   // 90° → vertical
    length: 100,
  })
  const surface = mirror.getSurfaces()[0]

  it('rayon horizontal vers le miroir vertical : intersection trouvée', () => {
    const ray = makeRay(0, 0, 1, 0)
    const hit = surface.intersect(ray)
    expect(hit).not.toBeNull()
  })

  it('point d\'intersection ≈ (50, 0)', () => {
    const ray = makeRay(0, 0, 1, 0)
    const hit = surface.intersect(ray)!
    expect(hit.point.x).toBeCloseTo(50, 6)
    expect(hit.point.y).toBeCloseTo(0, 6)
  })

  it('normale orientée vers le rayon incident (dot < 0)', () => {
    const ray = makeRay(0, 0, 1, 0)
    const hit = surface.intersect(ray)!
    const dotVal = ray.direction.x * hit.normal.x + ray.direction.y * hit.normal.y
    expect(dotVal).toBeLessThan(0)
  })

  it('rayon parallèle au miroir : pas d\'intersection', () => {
    const ray = makeRay(0, 10, 0, 1)   // vertical, parallèle au miroir vertical
    expect(surface.intersect(ray)).toBeNull()
  })

  it('rayon dans la mauvaise direction : pas d\'intersection', () => {
    const ray = makeRay(100, 0, 1, 0)  // part à droite, s'éloigne du miroir
    expect(surface.intersect(ray)).toBeNull()
  })

  it('rayon visant hors du segment : pas d\'intersection', () => {
    const ray = makeRay(0, 200, 1, 0)  // y = 200, hors du segment [−50, 50]
    expect(surface.intersect(ray)).toBeNull()
  })

  it('t est positif', () => {
    const ray = makeRay(0, 0, 1, 0)
    const hit = surface.intersect(ray)!
    expect(hit.t).toBeGreaterThan(0)
  })

  it('surfaceId correspond à l\'id du miroir', () => {
    const ray = makeRay(0, 0, 1, 0)
    const hit = surface.intersect(ray)!
    expect(hit.surfaceId).toBe('m2-surface')
  })
})

// ─── V1 : Réflexion miroir plan 45° ─────────────────────────────────────────
//
// Scène : miroir incliné à 45° centré en (0, 0), longueur = 200.
// Rayon horizontal (1, 0) venant de (−50, 0).
// Attendu : rayon réfléchi = (0, 1), θ_r = θ_i = 45°.
// ─────────────────────────────────────────────────────────────────────────────

describe('V1 — Réflexion miroir plan 45°', () => {
  const mirror = new FlatMirror({
    id: 'v1',
    position: { x: 0, y: 0 },
    angle: Math.PI / 4,   // 45° par rapport à l'horizontale
    length: 200,
  })
  const surface = mirror.getSurfaces()[0]
  const ray = makeRay(-50, 0, 1, 0)   // rayon horizontal partant de gauche

  it('le rayon frappe le miroir', () => {
    expect(surface.intersect(ray)).not.toBeNull()
  })

  it('le point d\'impact est à l\'origine (0, 0)', () => {
    const hit = surface.intersect(ray)!
    expect(hit.point.x).toBeCloseTo(0, 6)
    expect(hit.point.y).toBeCloseTo(0, 6)
  })

  it('la normale au point d\'impact est correctement orientée', () => {
    const hit = surface.intersect(ray)!
    // La normale doit satisfaire dot(d, n) < 0
    const d = ray.direction
    const dotVal = d.x * hit.normal.x + d.y * hit.normal.y
    expect(dotVal).toBeLessThan(0)
  })

  it('rayon réfléchi ≈ (0, 1)', () => {
    const hit = surface.intersect(ray)!
    const r = reflect(ray.direction, hit.normal)
    expect(r.x).toBeCloseTo(0, 6)
    expect(r.y).toBeCloseTo(1, 6)
  })

  it('θ_r = θ_i = 45°', () => {
    const hit = surface.intersect(ray)!
    const r = reflect(ray.direction, hit.normal)
    const thetaI = incidenceAngle(ray.direction, hit.normal) * RAD
    const thetaR = incidenceAngle(r, hit.normal) * RAD
    expect(Math.abs(thetaI - 45)).toBeLessThan(EPS * RAD)
    expect(Math.abs(thetaR - 45)).toBeLessThan(EPS * RAD)
    expect(Math.abs(thetaI - thetaR)).toBeLessThan(EPS * RAD)
  })

  it('rayon réfléchi est unitaire', () => {
    const hit = surface.intersect(ray)!
    const r = reflect(ray.direction, hit.normal)
    expect(Math.abs(length(r) - 1)).toBeLessThan(EPS)
  })
})
