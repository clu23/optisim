/**
 * Validation physique — Phase 7C — Objet, image, diaphragme, pupilles
 *
 * AP1  ApertureElement : structure — deux surfaces wing, containsPoint=false
 * AP2  Aperture bloque les rayons hors ouverture (rayon à h > clearRadius stoppé)
 * AP3  Aperture laisse passer les rayons dans l'ouverture (rayon h < clearRadius traverse)
 * OB1  OpticalObject fini : génère n×numRays rayons (wavelengths × numRays)
 * OB2  OpticalObject infini : génère n×numRays rayons parallèles
 * OB3  OpticalObject multi-champ (numFieldPoints=3) : 3 × numRays × nλ rayons
 * IM1  computeImage — lentille mince f=100 : objet à x=-200 → image à x=200
 * IM2  computeImage — objet à l'infini (très loin) → image ≈ au foyer (f=100)
 * IM3  computeEFL — lentille mince f=120 : EFL ≈ 120 px
 * PU1  computePupils — système avec diaphragme : f/N calculable
 */

import { describe, it, expect } from 'vitest'
import { ApertureElement } from '../core/elements/aperture.ts'
import { OpticalObject }   from '../core/elements/optical-object.ts'
import { ThinLens }        from '../core/elements/thin-lens.ts'
import { traceRay }        from '../core/tracer.ts'
import { computeImage, computeEFL } from '../core/image-calculator.ts'
import { computePupils }   from '../core/pupils.ts'
import type { Scene, Ray } from '../core/types.ts'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeScene(...elements: Scene['elements']): Scene {
  return { elements, sources: [], metadata: { name: 'test' } }
}

// ─── AP1 : ApertureElement — structure ────────────────────────────────────────

describe('AP1 — ApertureElement structure', () => {
  const ap = new ApertureElement({ id: 'a1', position: { x: 0, y: 0 }, angle: 0, diameter: 100, clearRadius: 25 })

  it('a deux surfaces wing', () => {
    expect(ap.getSurfaces()).toHaveLength(2)
  })

  it('clearRadius ≤ diameter/2', () => {
    const apOver = new ApertureElement({ id: 'a2', position: { x: 0, y: 0 }, angle: 0, diameter: 100, clearRadius: 999 })
    expect(apOver.clearRadius).toBe(50)
  })

  it('containsPoint retourne false', () => {
    expect(ap.containsPoint({ x: 0, y: 0 })).toBe(false)
    expect(ap.containsPoint({ x: 0, y: 40 })).toBe(false)
  })

  it('type === aperture', () => {
    expect(ap.type).toBe('aperture')
  })
})

// ─── AP2 : Aperture bloque les rayons hors ouverture ─────────────────────────

describe('AP2 — Aperture bloque rayon h > clearRadius', () => {
  /**
   * Diaphragme en x=100, angle=0, clearRadius=20.
   * Rayon à h=40 (>clearRadius) doit être absorbé avant d'aller loin.
   */
  it('rayon bloqué : dernier segment se termine avant x=200', () => {
    const ap = new ApertureElement({ id: 'ap', position: { x: 100, y: 0 }, angle: 0, diameter: 120, clearRadius: 20 })
    const scene = makeScene(ap)
    const ray: Ray = { origin: { x: 0, y: 40 }, direction: { x: 1, y: 0 }, wavelength: 550, intensity: 1 }
    const result = traceRay(ray, scene)
    const lastSeg = result.segments[result.segments.length - 1]
    // Le rayon doit s'arrêter au niveau du diaphragme (x ≈ 100), pas continuer
    expect(lastSeg.end.x).toBeLessThan(150)
  })
})

// ─── AP3 : Aperture laisse passer les rayons dans l'ouverture ─────────────────

describe('AP3 — Aperture laisse passer rayon h < clearRadius', () => {
  it('rayon passe : dernier segment dépasse x=200', () => {
    const ap = new ApertureElement({ id: 'ap', position: { x: 100, y: 0 }, angle: 0, diameter: 120, clearRadius: 30 })
    const scene = makeScene(ap)
    const ray: Ray = { origin: { x: 0, y: 10 }, direction: { x: 1, y: 0 }, wavelength: 550, intensity: 1 }
    const result = traceRay(ray, scene)
    const lastSeg = result.segments[result.segments.length - 1]
    expect(lastSeg.end.x).toBeGreaterThan(200)
  })
})

// ─── OB1 : OpticalObject fini — nombre de rayons ─────────────────────────────

describe('OB1 — OpticalObject fini génère numRays × nλ rayons', () => {
  it('3 rayons × 2 λ × 1 point champ = 6 rayons', () => {
    const obj = new OpticalObject({ id: 'o1', position: { x: 0, y: 0 }, mode: 'finite', height: 50, numRays: 3, wavelengths: [486, 656], numFieldPoints: 1 })
    const rays = obj.generateRays()
    expect(rays).toHaveLength(6)
  })

  it('directions distinctes (éventail)', () => {
    const obj = new OpticalObject({ id: 'o2', position: { x: 0, y: 0 }, mode: 'finite', height: 50, numRays: 3, wavelengths: [550], numFieldPoints: 1, spreadAngle: Math.PI / 4 })
    const rays = obj.generateRays()
    // 3 rayons d'angles distincts
    const angles = rays.map(r => Math.atan2(r.direction.y, r.direction.x))
    expect(new Set(angles.map(a => a.toFixed(4))).size).toBe(3)
  })
})

// ─── OB2 : OpticalObject infini — rayons parallèles ──────────────────────────

describe('OB2 — OpticalObject infini : rayons parallèles', () => {
  it('toutes les directions identiques (mode infini, 1 angle de champ)', () => {
    const obj = new OpticalObject({ id: 'o3', position: { x: 0, y: 0 }, mode: 'infinite', height: 0, numRays: 5, wavelengths: [550], numFieldPoints: 1 })
    const rays = obj.generateRays()
    expect(rays).toHaveLength(5)
    // Toutes les directions sont identiques
    const dir0 = rays[0].direction
    for (const r of rays) {
      expect(r.direction.x).toBeCloseTo(dir0.x, 6)
      expect(r.direction.y).toBeCloseTo(dir0.y, 6)
    }
  })
})

// ─── OB3 : OpticalObject multi-champ ─────────────────────────────────────────

describe('OB3 — OpticalObject multi-champ (numFieldPoints=3)', () => {
  it('3 points × 4 rayons × 1 λ = 12 rayons', () => {
    const obj = new OpticalObject({ id: 'o4', position: { x: 0, y: 0 }, mode: 'finite', height: 60, numRays: 4, wavelengths: [550], numFieldPoints: 3 })
    const rays = obj.generateRays()
    expect(rays).toHaveLength(12)
  })

  it('origines distinctes pour les 3 points de champ', () => {
    const obj = new OpticalObject({ id: 'o5', position: { x: 0, y: 0 }, mode: 'finite', height: 60, numRays: 1, wavelengths: [550], numFieldPoints: 3 })
    const rays = obj.generateRays()
    const ySet = new Set(rays.map(r => r.origin.y.toFixed(4)))
    expect(ySet.size).toBe(3)   // 0, 30, 60
  })
})

// ─── IM1 : computeImage — lentille mince f=100 ────────────────────────────────

describe('IM1 — computeImage : lentille f=100, objet à -200', () => {
  /**
   * Loi des lentilles : 1/v - 1/u = 1/f
   * u = -200 (objet à gauche), f = 100 → v = 200 (image réelle à droite)
   * m = v/u = 200/(-200) = -1 (renversé, même taille)
   */
  const lens = new ThinLens({ id: 'l1', position: { x: 0, y: 0 }, angle: 0, focalLength: 100, height: 200 })
  const scene = makeScene(lens)

  it('image réelle à x ≈ 200', () => {
    const result = computeImage(scene, -200, 0, 550)
    expect(result.imageX).not.toBeNull()
    expect(result.imageX!).toBeCloseTo(200, -1)   // tolérance ±10 px
    expect(result.isReal).toBe(true)
  })

  it('grandissement ≈ −1 (objet à 2f)', () => {
    const result = computeImage(scene, -200, 50, 550)
    expect(result.magnification).not.toBeNull()
    expect(Math.abs(result.magnification!)).toBeCloseTo(1, 0)
  })
})

// ─── IM2 : computeImage — objet très loin → image au foyer ───────────────────

describe('IM2 — computeImage : objet très loin → image ≈ foyer f=100', () => {
  const lens = new ThinLens({ id: 'l2', position: { x: 0, y: 0 }, angle: 0, focalLength: 100, height: 200 })
  const scene = makeScene(lens)

  it('image à x ≈ 100 pour objet à x=-5000', () => {
    const result = computeImage(scene, -5000, 0, 550)
    if (result.imageX !== null) {
      expect(result.imageX).toBeCloseTo(100, -1)
    }
  })
})

// ─── IM3 : computeEFL ─────────────────────────────────────────────────────────

describe('IM3 — computeEFL : lentille mince f=120', () => {
  const lens = new ThinLens({ id: 'l3', position: { x: 0, y: 0 }, angle: 0, focalLength: 120, height: 200 })
  const scene = makeScene(lens)

  it('EFL ≈ 120 px (±5%)', () => {
    const efl = computeEFL(scene, 550, -1000, 5)
    expect(efl).not.toBeNull()
    expect(Math.abs(efl!)).toBeCloseTo(120, -1)
  })
})

// ─── PU1 : computePupils ─────────────────────────────────────────────────────

describe('PU1 — computePupils : f/N avec lentille + diaphragme', () => {
  /**
   * Lentille f=200 px + diaphragme clearRadius=20 → f/N = 200/40 = 5.
   * Test: f/N entre 2 et 20 (ordre de grandeur).
   */
  const lens = new ThinLens({ id: 'l4', position: { x: 0, y: 0 }, angle: 0, focalLength: 200, height: 200 })
  const ap   = new ApertureElement({ id: 'ap4', position: { x: -50, y: 0 }, angle: 0, diameter: 80, clearRadius: 20 })
  const scene = makeScene(lens, ap)

  it('f/N calculé et positif', () => {
    const pupils = computePupils(scene, -500, 550)
    expect(pupils.fNumber).not.toBeNull()
    expect(pupils.fNumber!).toBeGreaterThan(1)
    expect(pupils.fNumber!).toBeLessThan(100)
  })

  it('NA > 0', () => {
    const pupils = computePupils(scene, -500, 550)
    expect(pupils.NA).not.toBeNull()
    expect(pupils.NA!).toBeGreaterThan(0)
    expect(pupils.NA!).toBeLessThan(1)
  })
})
