/**
 * Tests — Prism (core/elements/prism.ts)
 *
 * Couvre :
 *  - Structure (type, getSurfaces, label, getRefractiveIndex)
 *  - Géométrie des sommets (angle=0 et angle rotationné)
 *  - containsPoint (point-dans-polygone, cas limites)
 *  - BoundingBox
 *  - Intersections (entrée, sortie, rayon manquant, normale)
 *  - V5 : Déviation minimale prisme 60°, n=1.5 → δ_min = 37.18°
 *
 * ─── Dérivation de la direction incidente à déviation minimale ────────────
 *
 * Pour un prisme équilatéral (angle au sommet A=60°, n=1.5) :
 *   θ_r = A/2 = 30°       (angle intérieur à chaque face)
 *   θ_i = arcsin(n·sin(θ_r)) = arcsin(0.75) ≈ 48.59°   (angle incident)
 *   δ_min = 2·θ_i − A = 2·arcsin(0.75) − π/3 ≈ 37.18°
 *
 * Le rayon interne à déviation minimale est parallèle à la base (direction (1,0)).
 * En appliquant Snell-Descartes vectoriel en sens inverse sur la face gauche
 * (normale sortante n⃗_out = (−√3/2, 1/2)) :
 *
 *   d_tang  = (n₂/n₁)·t_tang = 1.5·(1/4, √3/4) = (3/8, 3√3/8)
 *   d_in    = d_tang + cos(θ_i)·n⃗_in = d_tang + (√7/4)·(√3/2, −1/2)
 *           = ((3+√21)/8,  (3√3−√7)/8)    [vecteur déjà unitaire ✓]
 */

import { describe, it, expect } from 'vitest'
import { Prism } from './prism.ts'
import { refract } from '../optics.ts'
import { normalize, dot, length, distance, sub } from '../vector.ts'
import type { Vec2, Ray, HitResult, OpticalSurface } from '../types.ts'

const RAD = 180 / Math.PI
const EPS_ANGLE = 1e-6   // tolérance angulaire (radians)
const EPS_POS   = 1e-6   // tolérance de position

function makeRay(ox: number, oy: number, dx: number, dy: number): Ray {
  return {
    origin: { x: ox, y: oy },
    direction: normalize({ x: dx, y: dy }),
    wavelength: 550,
    intensity: 1,
  }
}

/** Premier hit (t minimal) sur la liste de surfaces. */
function firstHit(surfaces: OpticalSurface[], ray: Ray): HitResult | null {
  let best: HitResult | null = null
  for (const s of surfaces) {
    const h = s.intersect(ray)
    if (h !== null && (best === null || h.t < best.t)) best = h
  }
  return best
}

/** Premier hit en excluant une surface par son id. */
function firstHitExcluding(surfaces: OpticalSurface[], ray: Ray, excludeId: string): HitResult | null {
  let best: HitResult | null = null
  for (const s of surfaces) {
    if (s.id === excludeId) continue
    const h = s.intersect(ray)
    if (h !== null && (best === null || h.t < best.t)) best = h
  }
  return best
}

// ─── Structure ───────────────────────────────────────────────────────────────

describe('Prism — structure', () => {
  const prism = new Prism({ id: 'p1', position: { x: 0, y: 0 }, angle: 0, size: 200, n: 1.5 })

  it('type est "prism"', () => {
    expect(prism.type).toBe('prism')
  })

  it('getSurfaces retourne exactement 3 surfaces', () => {
    expect(prism.getSurfaces()).toHaveLength(3)
  })

  it('ids des surfaces : p1-s0, p1-s1, p1-s2', () => {
    const ids = prism.getSurfaces().map(s => s.id)
    expect(ids).toEqual(['p1-s0', 'p1-s1', 'p1-s2'])
  })

  it('getRefractiveIndex retourne n = 1.5', () => {
    for (const s of prism.getSurfaces()) {
      expect(s.getRefractiveIndex(550)).toBe(1.5)
    }
  })

  it('label par défaut est "Prisme"', () => {
    expect(prism.label).toBe('Prisme')
  })

  it('label personnalisé est respecté', () => {
    const p = new Prism({ id: 'x', position: { x: 0, y: 0 }, angle: 0, size: 100, n: 1.5, label: 'Crown' })
    expect(p.label).toBe('Crown')
  })
})

// ─── Géométrie des sommets — équilatéral (apexAngle = 60°, défaut) ───────────

describe('Prism — sommets équilatéraux (angle = 0, size = 200)', () => {
  const SIZE = 200
  const prism = new Prism({ id: 'g1', position: { x: 0, y: 0 }, angle: 0, size: SIZE, n: 1.5 })
  const [v0, v1, v2] = prism.vertices()
  const R = prism.circumradius()

  it('circumradius = size / (2·cos(30°)) = size/√3', () => {
    expect(Math.abs(R - SIZE / Math.sqrt(3))).toBeLessThan(EPS_POS)
  })

  it('apexAngle vaut π/3 par défaut', () => {
    expect(Math.abs(prism.apexAngle - Math.PI / 3)).toBeLessThan(EPS_POS)
  })

  it('V0 est le sommet le plus haut (apex)', () => {
    expect(v0.y).toBeGreaterThan(v1.y)
    expect(v0.y).toBeGreaterThan(v2.y)
  })

  it('V0 est sur l\'axe vertical (x ≈ 0)', () => {
    expect(Math.abs(v0.x)).toBeLessThan(EPS_POS)
  })

  it('V1 est à gauche (x < 0), V2 à droite (x > 0)', () => {
    expect(v1.x).toBeLessThan(0)
    expect(v2.x).toBeGreaterThan(0)
  })

  it('base horizontale : V1.y ≈ V2.y', () => {
    expect(Math.abs(v1.y - v2.y)).toBeLessThan(EPS_POS)
  })

  it('triangle équilatéral : les 2 jambes sont égales à size', () => {
    expect(Math.abs(distance(v0, v1) - SIZE)).toBeLessThan(EPS_POS)
    expect(Math.abs(distance(v2, v0) - SIZE)).toBeLessThan(EPS_POS)
  })

  it('tous les angles intérieurs sont 60°', () => {
    function interiorAngle(a: Vec2, b: Vec2, c: Vec2): number {
      const ab = normalize(sub(a, b))
      const cb = normalize(sub(c, b))
      return Math.acos(Math.max(-1, Math.min(1, dot(ab, cb)))) * RAD
    }
    expect(Math.abs(interiorAngle(v1, v0, v2) - 60)).toBeLessThan(1e-4)
    expect(Math.abs(interiorAngle(v0, v1, v2) - 60)).toBeLessThan(1e-4)
    expect(Math.abs(interiorAngle(v0, v2, v1) - 60)).toBeLessThan(1e-4)
  })

  it('winding CCW : produit vectoriel V01 × V02 > 0', () => {
    const v01x = v1.x - v0.x, v01y = v1.y - v0.y
    const v02x = v2.x - v0.x, v02y = v2.y - v0.y
    expect(v01x * v02y - v01y * v02x).toBeGreaterThan(0)
  })

  it('centroïde = position (0, 0)', () => {
    const cx = (v0.x + v1.x + v2.x) / 3
    const cy = (v0.y + v1.y + v2.y) / 3
    expect(Math.abs(cx)).toBeLessThan(EPS_POS)
    expect(Math.abs(cy)).toBeLessThan(EPS_POS)
  })

  it('position décalée : sommets décalés de la même valeur', () => {
    const p2 = new Prism({ id: 'g2', position: { x: 50, y: 30 }, angle: 0, size: SIZE, n: 1.5 })
    const [w0] = p2.vertices()
    expect(Math.abs(w0.x - (v0.x + 50))).toBeLessThan(EPS_POS)
    expect(Math.abs(w0.y - (v0.y + 30))).toBeLessThan(EPS_POS)
  })
})

// ─── Géométrie — apexAngle non-équilatéral ───────────────────────────────────

describe('Prism — apexAngle = 30° (isocèle non-équilatéral)', () => {
  const SIZE = 200
  const APEX = 30 * Math.PI / 180
  const prism = new Prism({ id: 'iso1', position: { x: 0, y: 0 }, angle: 0, size: SIZE, apexAngle: APEX, n: 1.5 })
  const [v0, v1, v2] = prism.vertices()

  it('apexAngle est bien 30° (π/6)', () => {
    expect(prism.apexAngle).toBeCloseTo(APEX, 10)
  })

  it('angle au sommet (V0) mesure 30°', () => {
    const ab = normalize(sub(v1, v0))
    const ac = normalize(sub(v2, v0))
    const ang = Math.acos(Math.max(-1, Math.min(1, dot(ab, ac)))) * RAD
    expect(Math.abs(ang - 30)).toBeLessThan(1e-4)
  })

  it('les deux jambes (V0-V1 et V0-V2) mesurent size', () => {
    expect(Math.abs(distance(v0, v1) - SIZE)).toBeLessThan(EPS_POS)
    expect(Math.abs(distance(v2, v0) - SIZE)).toBeLessThan(EPS_POS)
  })

  it('centroïde = (0, 0)', () => {
    const cx = (v0.x + v1.x + v2.x) / 3
    const cy = (v0.y + v1.y + v2.y) / 3
    expect(Math.abs(cx)).toBeLessThan(EPS_POS)
    expect(Math.abs(cy)).toBeLessThan(EPS_POS)
  })

  it('V0 est en haut (apex), V1.y ≈ V2.y (base horizontale)', () => {
    expect(v0.y).toBeGreaterThan(v1.y)
    expect(Math.abs(v1.y - v2.y)).toBeLessThan(EPS_POS)
  })

  it('winding CCW', () => {
    const v01x = v1.x - v0.x, v01y = v1.y - v0.y
    const v02x = v2.x - v0.x, v02y = v2.y - v0.y
    expect(v01x * v02y - v01y * v02x).toBeGreaterThan(0)
  })

  it('circumradius = size / (2·cos(15°))', () => {
    const expected = SIZE / (2 * Math.cos(APEX / 2))
    expect(Math.abs(prism.circumradius() - expected)).toBeLessThan(EPS_POS)
  })
})

// ─── Géométrie — rotation ────────────────────────────────────────────────────

describe('Prism — rotation (angle = π/3)', () => {
  const SIZE = 150
  const prism = new Prism({ id: 'r1', position: { x: 0, y: 0 }, angle: Math.PI / 3, size: SIZE, n: 1.5 })
  const [v0, v1, v2] = prism.vertices()

  it('les jambes restent égales à size après rotation', () => {
    expect(Math.abs(distance(v0, v1) - SIZE)).toBeLessThan(EPS_POS)
    expect(Math.abs(distance(v2, v0) - SIZE)).toBeLessThan(EPS_POS)
  })

  it('le centroïde reste à (0, 0) après rotation', () => {
    const cx = (v0.x + v1.x + v2.x) / 3
    const cy = (v0.y + v1.y + v2.y) / 3
    expect(Math.abs(cx)).toBeLessThan(EPS_POS)
    expect(Math.abs(cy)).toBeLessThan(EPS_POS)
  })
})

// ─── containsPoint ───────────────────────────────────────────────────────────

describe('Prism — containsPoint (size = 200, position = (0,0))', () => {
  const prism = new Prism({ id: 'cp1', position: { x: 0, y: 0 }, angle: 0, size: 200, n: 1.5 })
  const R = prism.circumradius()  // ≈ 115.47

  it('centroïde (0, 0) est intérieur', () => {
    expect(prism.containsPoint({ x: 0, y: 0 })).toBe(true)
  })

  it('point au-dessus de l\'apex est extérieur', () => {
    expect(prism.containsPoint({ x: 0, y: R + 10 })).toBe(false)
  })

  it('point en dessous de la base est extérieur', () => {
    // La base est à y = −R/2 ≈ −57.74
    expect(prism.containsPoint({ x: 0, y: -R / 2 - 10 })).toBe(false)
  })

  it('point loin à gauche est extérieur', () => {
    expect(prism.containsPoint({ x: -200, y: 0 })).toBe(false)
  })

  it('point loin à droite est extérieur', () => {
    expect(prism.containsPoint({ x: 200, y: 0 })).toBe(false)
  })

  it('point légèrement intérieur à la face gauche (y=0)', () => {
    // Face gauche à y=0 se trouve en x = −2R/3 ≈ −76.98... recalc :
    // V0=(0, R), V1=(−100, −R/2). La face gauche à y=0 :
    // u = R / (3R/2) = 2/3 → x = 0 + (2/3)*(−100) = −66.67
    // Un point à x = −65 est donc légèrement intérieur
    expect(prism.containsPoint({ x: -65, y: 0 })).toBe(true)
  })

  it('point légèrement extérieur à la face gauche (y=0)', () => {
    // x = −70 est en dehors de la face gauche
    expect(prism.containsPoint({ x: -70, y: 0 })).toBe(false)
  })

  it('position déplacée : le centroïde déplacé est toujours intérieur', () => {
    const p2 = new Prism({ id: 'cp2', position: { x: 100, y: 50 }, angle: 0, size: 200, n: 1.5 })
    expect(p2.containsPoint({ x: 100, y: 50 })).toBe(true)
    expect(p2.containsPoint({ x: 0, y: 0 })).toBe(false)
  })
})

// ─── BoundingBox ─────────────────────────────────────────────────────────────

describe('Prism — getBoundingBox', () => {
  const prism = new Prism({ id: 'bb1', position: { x: 0, y: 0 }, angle: 0, size: 200, n: 1.5 })
  const bb = prism.getBoundingBox()
  const verts = prism.vertices()

  it('la bbox contient tous les sommets (avec marge)', () => {
    for (const v of verts) {
      expect(v.x).toBeGreaterThanOrEqual(bb.min.x)
      expect(v.x).toBeLessThanOrEqual(bb.max.x)
      expect(v.y).toBeGreaterThanOrEqual(bb.min.y)
      expect(v.y).toBeLessThanOrEqual(bb.max.y)
    }
  })

  it('la bbox a une marge positive au-delà des sommets', () => {
    const [v0, v1, v2] = verts
    expect(bb.min.x).toBeLessThan(Math.min(v0.x, v1.x, v2.x))
    expect(bb.max.x).toBeGreaterThan(Math.max(v0.x, v1.x, v2.x))
    expect(bb.min.y).toBeLessThan(Math.min(v0.y, v1.y, v2.y))
    expect(bb.max.y).toBeGreaterThan(Math.max(v0.y, v1.y, v2.y))
  })
})

// ─── Intersection ────────────────────────────────────────────────────────────

describe('Prism — intersections (angle = 0, size = 200, position = (0,0))', () => {
  const prism = new Prism({ id: 'i1', position: { x: 0, y: 0 }, angle: 0, size: 200, n: 1.5 })
  const surfaces = prism.getSurfaces()

  it('rayon horizontal depuis la gauche frappe la face gauche (S0)', () => {
    const ray = makeRay(-300, 0, 1, 0)
    expect(surfaces[0].intersect(ray)).not.toBeNull()
  })

  it('rayon depuis le bas frappe la base (S1)', () => {
    const ray = makeRay(0, -300, 0, 1)
    expect(surfaces[1].intersect(ray)).not.toBeNull()
  })

  it('rayon horizontal depuis la droite frappe la face droite (S2)', () => {
    const ray = makeRay(300, 0, -1, 0)
    expect(surfaces[2].intersect(ray)).not.toBeNull()
  })

  it('rayon manquant le prisme : pas d\'intersection', () => {
    // Rayon passant loin en dessous
    const ray = makeRay(-300, -200, 1, 0)
    expect(firstHit(surfaces, ray)).toBeNull()
  })

  it('normale de S0 orientée vers le rayon incident (dot < 0)', () => {
    const ray = makeRay(-300, 0, 1, 0)
    const hit = surfaces[0].intersect(ray)!
    expect(dot(ray.direction, hit.normal)).toBeLessThan(0)
  })

  it('normale de la base (S1) orientée vers le bas (n.y < 0)', () => {
    // La base est horizontale, sa normale sortante pointe vers le bas (−y)
    const ray = makeRay(0, -300, 0, 1)
    const hit = surfaces[1].intersect(ray)!
    expect(dot(ray.direction, hit.normal)).toBeLessThan(0)
    expect(hit.normal.y).toBeLessThan(0)
  })

  it('t est positif', () => {
    const ray = makeRay(-300, 0, 1, 0)
    const hit = surfaces[0].intersect(ray)!
    expect(hit.t).toBeGreaterThan(0)
  })

  it('surfaceId correspond à "i1-s0"', () => {
    const ray = makeRay(-300, 0, 1, 0)
    const hit = surfaces[0].intersect(ray)!
    expect(hit.surfaceId).toBe('i1-s0')
  })
})

// ─── V5 : Déviation minimale — prisme 60°, n = 1.5 ──────────────────────────
//
// Scène :
//   Prisme équilatéral, sommet en (0,0), angle=0, size=200, n=1.5.
//   Rayon incident à la déviation minimale : direction analytique dIn.
//   Le rayon entre par la face gauche, chemine horizontalement à l'intérieur,
//   sort par la face droite.
//
// Vérification :
//   δ_actuel = arccos(dIn · dOut) ≈ δ_min = 2·arcsin(0.75) − π/3 ≈ 37.177°
//   Tolérance : 1e-6 rad.
// ─────────────────────────────────────────────────────────────────────────────

describe('V5 — Déviation minimale prisme 60°, n = 1.5', () => {
  const N = 1.5
  const A = Math.PI / 3   // angle au sommet : 60°

  // Déviation minimale théorique (formule analytique)
  // δ_min = 2·arcsin(n·sin(A/2)) − A
  const thetaI = Math.asin(N * Math.sin(A / 2))     // arcsin(0.75) ≈ 0.84806 rad
  const deltaMinTheoretical = 2 * thetaI - A          // ≈ 0.64892 rad ≈ 37.177°

  // Direction incidente à la déviation minimale (vecteur unitaire, voir dérivation en tête de fichier)
  // dIn = ((3+√21)/8, (3√3−√7)/8)  — normalisé analytiquement : |(3+√21)²+(3√3−√7)²| = 64
  const dIn = {
    x: (3 + Math.sqrt(21)) / 8,               // ≈ 0.94782
    y: (3 * Math.sqrt(3) - Math.sqrt(7)) / 8, // ≈ 0.31880
  }

  const prism = new Prism({ id: 'v5', position: { x: 0, y: 0 }, angle: 0, size: 200, n: N })
  const surfaces = prism.getSurfaces()

  // Rayon incident partant de (−300, 0) — frappe la face gauche (S0)
  const rayIn = makeRay(-300, 0, dIn.x, dIn.y)

  it('dIn est bien unitaire (vérification de la formule analytique)', () => {
    expect(Math.abs(length(dIn) - 1)).toBeLessThan(EPS_ANGLE)
  })

  it('l\'angle incident théorique θ_i = arcsin(0.75) ≈ 48.59°', () => {
    expect(Math.abs(thetaI * RAD - 48.5904)).toBeLessThan(1e-3)
  })

  it('δ_min théorique ≈ 37.18° (SPECS.md V5)', () => {
    // Valeur exacte : 2·arcsin(0.75)·(180/π) − 60 = 37.1808°
    expect(Math.abs(deltaMinTheoretical * RAD - 37.18)).toBeLessThan(0.01)
  })

  it('le rayon incident frappe une surface du prisme (entrée)', () => {
    expect(firstHit(surfaces, rayIn)).not.toBeNull()
  })

  it('pas de réflexion totale à l\'entrée (n₁=1 → n₂=1.5)', () => {
    const hitEntry = firstHit(surfaces, rayIn)!
    const dRefracted = refract(rayIn.direction, hitEntry.normal, 1.0, N)
    expect(dRefracted).not.toBeNull()
  })

  it('le rayon interne est approximativement horizontal (∥ à la base)', () => {
    const hitEntry = firstHit(surfaces, rayIn)!
    const dInternal = refract(rayIn.direction, hitEntry.normal, 1.0, N)!
    // À la déviation minimale, le rayon intérieur est parallèle à la base (y ≈ 0)
    expect(Math.abs(dInternal.y)).toBeLessThan(1e-9)
    expect(dInternal.x).toBeGreaterThan(0)
  })

  it('le rayon interne sort par une face (sortie)', () => {
    const hitEntry = firstHit(surfaces, rayIn)!
    const dInternal = refract(rayIn.direction, hitEntry.normal, 1.0, N)!
    const rayInternal = makeRay(hitEntry.point.x, hitEntry.point.y, dInternal.x, dInternal.y)
    const hitExit = firstHitExcluding(surfaces, rayInternal, hitEntry.surfaceId)
    expect(hitExit).not.toBeNull()
  })

  it('pas de réflexion totale à la sortie (n₁=1.5 → n₂=1)', () => {
    const hitEntry = firstHit(surfaces, rayIn)!
    const dInternal = refract(rayIn.direction, hitEntry.normal, 1.0, N)!
    const rayInternal = makeRay(hitEntry.point.x, hitEntry.point.y, dInternal.x, dInternal.y)
    const hitExit = firstHitExcluding(surfaces, rayInternal, hitEntry.surfaceId)!
    const dExit = refract(dInternal, hitExit.normal, N, 1.0)
    expect(dExit).not.toBeNull()
  })

  it('la direction de sortie est unitaire', () => {
    const hitEntry = firstHit(surfaces, rayIn)!
    const dInternal = refract(rayIn.direction, hitEntry.normal, 1.0, N)!
    const rayInternal = makeRay(hitEntry.point.x, hitEntry.point.y, dInternal.x, dInternal.y)
    const hitExit = firstHitExcluding(surfaces, rayInternal, hitEntry.surfaceId)!
    const dExit = refract(dInternal, hitExit.normal, N, 1.0)!
    expect(Math.abs(length(dExit) - 1)).toBeLessThan(EPS_ANGLE)
  })

  it(`δ_actuel = arccos(dIn·dOut) ≈ ${(deltaMinTheoretical * RAD).toFixed(3)}° (±1e-6 rad)`, () => {
    // Trace complète : entrée → interne → sortie
    const hitEntry = firstHit(surfaces, rayIn)!
    const dInternal = refract(rayIn.direction, hitEntry.normal, 1.0, N)!
    const rayInternal = makeRay(hitEntry.point.x, hitEntry.point.y, dInternal.x, dInternal.y)
    const hitExit = firstHitExcluding(surfaces, rayInternal, hitEntry.surfaceId)!
    const dExit = refract(dInternal, hitExit.normal, N, 1.0)!

    // Déviation = angle entre la direction incidente et la direction de sortie
    const cosDeviation = Math.max(-1, Math.min(1, dot(dIn, dExit)))
    const deltaActual = Math.acos(cosDeviation)

    expect(Math.abs(deltaActual - deltaMinTheoretical)).toBeLessThan(EPS_ANGLE)
  })
})
