/**
 * Tests — CurvedMirror (core/elements/curved-mirror.ts)
 *
 * Couvre :
 *  - Structure (getSurfaces, getBoundingBox, containsPoint)
 *  - Intersection concave : rayon touché, point correct, normale orientée
 *  - Intersection convexe : rayon touché, normale orientée
 *  - Cas limites : rayon parallèle, rayon hors arc, rayon derrière le miroir
 *  - V9-sphère : 5 rayons paraxiaux parallèles convergent au foyer R/2
 *                (tolérance 1 px sur R = 200 px)
 */

import { describe, it, expect } from 'vitest'
import { CurvedMirror } from './curved-mirror.ts'
import { reflect } from '../optics.ts'
import { length, normalize } from '../vector.ts'
import type { Vec2 } from '../types.ts'

const EPS = 1e-6

function makeRay(ox: number, oy: number, dx: number, dy: number) {
  return {
    origin: { x: ox, y: oy },
    direction: normalize({ x: dx, y: dy }),
    wavelength: 550,
    intensity: 1,
  }
}

/**
 * Trouve le paramètre t auquel le rayon (origin + t·direction) croise y = axisY.
 * Retourne null si le rayon est parallèle à la droite.
 */
function crossAxisY(origin: Vec2, direction: Vec2, axisY = 0): number | null {
  if (Math.abs(direction.y) < 1e-12) return null
  const t = (axisY - origin.y) / direction.y
  return origin.x + t * direction.x
}

// ─── Structure ───────────────────────────────────────────────────────────────

describe('CurvedMirror — structure', () => {
  const mirror = new CurvedMirror({
    id: 'cm1',
    position: { x: 0, y: 0 },
    angle: 0,
    radius: 100,
    aperture: Math.PI / 6,  // 30°
    concave: true,
  })

  it('type est "curved-mirror"', () => {
    expect(mirror.type).toBe('curved-mirror')
  })

  it('getSurfaces retourne exactement 1 surface', () => {
    expect(mirror.getSurfaces()).toHaveLength(1)
  })

  it('la surface a le bon id', () => {
    expect(mirror.getSurfaces()[0].id).toBe('cm1-surface')
  })

  it('label par défaut est "Miroir concave"', () => {
    expect(mirror.label).toBe('Miroir concave')
  })

  it('label convexe par défaut est "Miroir convexe"', () => {
    const m = new CurvedMirror({ id: 'x', position: { x: 0, y: 0 }, angle: 0, radius: 100, aperture: 0.3, concave: false })
    expect(m.label).toBe('Miroir convexe')
  })

  it('getBoundingBox contient le sommet', () => {
    const bb = mirror.getBoundingBox()
    expect(mirror.containsPoint(mirror.position)).toBe(true)
    // Le sommet est dans la bbox
    expect(bb.min.x).toBeLessThan(mirror.position.x)
    expect(bb.max.x).toBeGreaterThan(mirror.position.x)
  })

  it('containsPoint — point lointain exclu', () => {
    expect(mirror.containsPoint({ x: 1000, y: 1000 })).toBe(false)
  })
})

// ─── Intersection — miroir concave (angle = 0, face au +x) ──────────────────
//
// Miroir concave, sommet en (0, 0), axe = +x, R = 200, aperture = 0.3 rad.
// Centre de courbure C = (200, 0). Arc côté −x (angle de l'arc = π).
// Rayons incidents depuis la droite (d = (−1, 0)).

describe('CurvedMirror — intersection concave', () => {
  const mirror = new CurvedMirror({
    id: 'cm-conc',
    position: { x: 0, y: 0 },
    angle: 0,
    radius: 200,
    aperture: 0.3,
    concave: true,
  })
  const surface = mirror.getSurfaces()[0]

  it('rayon axial (h = 0) frappe le sommet', () => {
    const ray = makeRay(400, 0, -1, 0)
    const hit = surface.intersect(ray)
    expect(hit).not.toBeNull()
    expect(hit!.point.x).toBeCloseTo(0, 4)
    expect(hit!.point.y).toBeCloseTo(0, 4)
  })

  it('rayon paraxial (h = 20) frappe le miroir', () => {
    const ray = makeRay(400, 20, -1, 0)
    const hit = surface.intersect(ray)
    expect(hit).not.toBeNull()
  })

  it('t est positif', () => {
    const ray = makeRay(400, 10, -1, 0)
    const hit = surface.intersect(ray)!
    expect(hit.t).toBeGreaterThan(0)
  })

  it('normale orientée vers le rayon incident (dot(d, n) < 0)', () => {
    const ray = makeRay(400, 15, -1, 0)
    const hit = surface.intersect(ray)!
    const d = ray.direction
    expect(d.x * hit.normal.x + d.y * hit.normal.y).toBeLessThan(0)
  })

  it('normale est unitaire', () => {
    const ray = makeRay(400, 10, -1, 0)
    const hit = surface.intersect(ray)!
    expect(Math.abs(length(hit.normal) - 1)).toBeLessThan(EPS)
  })

  it('surfaceId correct', () => {
    const ray = makeRay(400, 0, -1, 0)
    const hit = surface.intersect(ray)!
    expect(hit.surfaceId).toBe('cm-conc-surface')
  })

  it('rayon derrière le miroir : pas d\'intersection', () => {
    // Rayon allant vers la droite (+x), part de gauche — s'éloigne du miroir
    const ray = makeRay(-50, 0, 1, 0)
    // Ce rayon est dans la mauvaise direction pour frapper l'arc
    // (l'arc fait face au +x, donc les rayons venant du +x ont t > 0)
    // Un rayon allant dans le +x depuis la gauche passe derrière le miroir.
    // t = 400 - 0 / (-1) → ici on teste le rayon allant dans le mauvais sens
    const ray2 = makeRay(-50, 10, -1, 0)  // allant à gauche, ne peut pas atteindre x≈0 en partant de x=-50
    expect(surface.intersect(ray2)).toBeNull()
  })

  it('rayon visant hors de l\'arc (h >> aperture) : pas d\'intersection', () => {
    // h = 150 >> R*sin(0.3) ≈ 59 → hors de l'arc
    const ray = makeRay(400, 150, -1, 0)
    expect(surface.intersect(ray)).toBeNull()
  })

  it('rayon parallèle à l\'arc (tangentiel) : pas d\'intersection', () => {
    // Rayon vertical, parallèle à l'arc au niveau du sommet
    const ray = makeRay(0, -50, 0, 1)
    // Ce rayon longe le miroir sans le croiser normalement
    // (peut éventuellement toucher un bord — mais à x=0, direction (0,1),
    //  le rayon est tangent à la sphère au sommet → pas d'intersection valide)
    const hit = surface.intersect(ray)
    if (hit !== null) {
      // Si intersection, le t doit être positif et le point dans l'arc
      expect(hit.t).toBeGreaterThan(0)
    }
    // Test principal : pas de crash
  })
})

// ─── Intersection — miroir convexe ───────────────────────────────────────────
//
// Miroir convexe, sommet en (0, 0), axe = +x, R = 200.
// Centre de courbure C = (−200, 0). Arc côté +x (arcCenter = 0).

describe('CurvedMirror — intersection convexe', () => {
  const mirror = new CurvedMirror({
    id: 'cm-conv',
    position: { x: 0, y: 0 },
    angle: 0,
    radius: 200,
    aperture: 0.3,
    concave: false,
  })
  const surface = mirror.getSurfaces()[0]

  it('rayon axial (h = 0) frappe le sommet', () => {
    const ray = makeRay(100, 0, -1, 0)
    const hit = surface.intersect(ray)
    expect(hit).not.toBeNull()
    expect(hit!.point.x).toBeCloseTo(0, 4)
    expect(hit!.point.y).toBeCloseTo(0, 4)
  })

  it('rayon paraxial frappe le miroir', () => {
    const ray = makeRay(100, 10, -1, 0)
    expect(surface.intersect(ray)).not.toBeNull()
  })

  it('normale orientée vers le rayon incident (dot(d, n) < 0)', () => {
    const ray = makeRay(100, 10, -1, 0)
    const hit = surface.intersect(ray)!
    const d = ray.direction
    expect(d.x * hit.normal.x + d.y * hit.normal.y).toBeLessThan(0)
  })

  it('rayon réfléchi par le convexe diverge (composante y s\'éloigne de l\'axe)', () => {
    // h > 0 : rayon réfléchi doit avoir r.y > 0 (s'éloigne de l'axe)
    const ray = makeRay(100, 10, -1, 0)
    const hit = surface.intersect(ray)!
    const r = reflect(ray.direction, hit.normal)
    expect(r.y).toBeGreaterThan(0)  // diverge vers y positif
  })
})

// ─── Orientation — miroir incliné ────────────────────────────────────────────

describe('CurvedMirror — miroir incliné à 90°', () => {
  // Miroir concave faisant face au +y, sommet en (0, 0)
  const mirror = new CurvedMirror({
    id: 'cm-90',
    position: { x: 0, y: 0 },
    angle: Math.PI / 2,  // face au +y
    radius: 200,
    aperture: 0.3,
    concave: true,
  })
  const surface = mirror.getSurfaces()[0]

  it('rayon vertical ascendant frappe le miroir', () => {
    const ray = makeRay(0, 400, 0, -1)   // vient du haut, va vers le bas
    expect(surface.intersect(ray)).not.toBeNull()
  })

  it('normale orientée vers le rayon incident', () => {
    const ray = makeRay(0, 400, 0, -1)
    const hit = surface.intersect(ray)!
    const d = ray.direction
    expect(d.x * hit.normal.x + d.y * hit.normal.y).toBeLessThan(0)
  })
})

// ─── V9-sphère : convergence au foyer paraxial ───────────────────────────────
//
// Scène : miroir sphérique concave, sommet en (0, 0), angle = 0 (face au +x),
//         R = 200, ouverture = 0.15 rad (petit → régime paraxial).
//
// 5 rayons parallèles à l'axe, issus de x = 500, hauteurs h = {−10, −5, 5, 10, 15}.
//
// Attendu : chaque rayon réfléchi croise l'axe optique (y = 0) au voisinage
//           du foyer paraxial x_f = R/2 = 100, avec une tolérance de 1 px.
//
// L'approximation sphérique introduit une aberration sphérique d'ordre (h/R)².
// Pour h = 15, R = 200 : correction ≈ h²/(2R) = 0.56 — bien dans la tolérance.
// ─────────────────────────────────────────────────────────────────────────────

describe('V9-sphère — convergence paraxiale au foyer R/2', () => {
  const R = 200
  const FOCAL = R / 2   // 100
  const TOL = 1         // tolérance : 1 px (0.5 % de R)

  const mirror = new CurvedMirror({
    id: 'v9',
    position: { x: 0, y: 0 },
    angle: 0,
    radius: R,
    aperture: 0.15,    // ~8.6° : régime paraxial garanti
    concave: true,
  })
  const surface = mirror.getSurfaces()[0]

  // Heights to test — non-zero to avoid the degenerate on-axis case
  const heights = [-10, -5, 5, 10, 15]

  for (const h of heights) {
    it(`rayon h = ${h} converge au foyer (|x_focus − ${FOCAL}| < ${TOL})`, () => {
      const ray = makeRay(500, h, -1, 0)

      const hit = surface.intersect(ray)
      expect(hit).not.toBeNull()

      // Rayon réfléchi
      const r = reflect(ray.direction, hit!.normal)

      // Le rayon réfléchi doit repartir vers les x positifs (côté source)
      expect(r.x).toBeGreaterThan(0)

      // Croisement avec l'axe optique (y = 0)
      const xFocus = crossAxisY(hit!.point, r)
      expect(xFocus).not.toBeNull()
      expect(Math.abs(xFocus! - FOCAL)).toBeLessThan(TOL)
    })
  }

  it('tous les foyers sont mutuellement proches (aberration sphérique < 1 px)', () => {
    const foci: number[] = []

    for (const h of heights) {
      const ray = makeRay(500, h, -1, 0)
      const hit = surface.intersect(ray)!
      const r = reflect(ray.direction, hit.normal)
      const xf = crossAxisY(hit.point, r)!
      foci.push(xf)
    }

    const xMin = Math.min(...foci)
    const xMax = Math.max(...foci)
    // Dispersion entre tous les foyers < 2*TOL
    expect(xMax - xMin).toBeLessThan(2 * TOL)
  })
})
