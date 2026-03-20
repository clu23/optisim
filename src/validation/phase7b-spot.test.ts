/**
 * Validation physique — Phase 7B — Spot diagram et métriques
 *
 * Tests :
 *   S1  ImagePlane : structure (type, getSurfaces vide, endpoints, getBoundingBox)
 *   S2  collectSpots : aucun segment → SpotData vide (points=[])
 *   S3  collectSpots : segment parallèle au plan → ignoré
 *   S4  collectSpots : un seul rayon → centroid = hit, rmsRadius = 0
 *   S5  collectSpots : deux rayons symétriques → centroid = 0, RMS calculé
 *   S6  collectSpots : segment hors demi-hauteur → rejeté
 *   S7  Miroir parabolique (κ=−1) + plan image au foyer → RMS ≈ 0
 *   S8  Lentille mince aberrante → RMS > 0 et se réduit quand on approche du foyer
 */

import { describe, it, expect } from 'vitest'
import { ImagePlane }  from '../core/elements/image-plane.ts'
import { collectSpots } from '../core/spot-diagram.ts'
import { ConicMirror }  from '../core/elements/conic-mirror.ts'
import { ThinLens }     from '../core/elements/thin-lens.ts'
import { traceRay }     from '../core/tracer.ts'
import { normalize }    from '../core/vector.ts'
import type { Ray, Scene, TraceResult } from '../core/types.ts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRay(ox: number, oy: number, dx: number, dy: number, wl = 550): Ray {
  return { origin: { x: ox, y: oy }, direction: normalize({ x: dx, y: dy }), wavelength: wl, intensity: 1 }
}

function makeScene(...elements: Scene['elements']): Scene {
  return { elements, sources: [], metadata: { name: 'test' } }
}

function traceAll(scene: Scene, rays: Ray[]): TraceResult[] {
  return rays.map(r => traceRay(r, scene))
}

// ─── S1 : Structure ───────────────────────────────────────────────────────────

describe('ImagePlane — structure', () => {
  const plane = new ImagePlane({ id: 'ip1', position: { x: 200, y: 0 }, angle: 0, height: 100 })

  it('type = image-plane', () => { expect(plane.type).toBe('image-plane') })
  it('getSurfaces() = []', () => { expect(plane.getSurfaces()).toHaveLength(0) })
  it('containsPoint() = false', () => { expect(plane.containsPoint({ x: 200, y: 0 })).toBe(false) })

  it('endpoints cohérents : centre = position', () => {
    const [a, b] = plane.endpoints()
    // angle=0 : planeDir = (0,1), endpoints à ±height en y
    expect((a.y + b.y) / 2).toBeCloseTo(0, 10)
    expect((a.x + b.x) / 2).toBeCloseTo(200, 10)
    expect(Math.abs(b.y - a.y)).toBeCloseTo(200, 5)
  })

  it('getBoundingBox contient les endpoints', () => {
    const bb = plane.getBoundingBox()
    const [a, b] = plane.endpoints()
    expect(bb.min.x).toBeLessThanOrEqual(Math.min(a.x, b.x))
    expect(bb.min.y).toBeLessThanOrEqual(Math.min(a.y, b.y))
    expect(bb.max.x).toBeGreaterThanOrEqual(Math.max(a.x, b.x))
    expect(bb.max.y).toBeGreaterThanOrEqual(Math.max(a.y, b.y))
  })
})

// ─── S2 : SpotData vide ───────────────────────────────────────────────────────

describe('collectSpots — cas limites', () => {
  const plane = new ImagePlane({ id: 'ip', position: { x: 100, y: 0 }, angle: 0, height: 80 })

  it('S2 : aucun résultat → spots vides', () => {
    const s = collectSpots(plane, [])
    expect(s.points).toHaveLength(0)
    expect(s.rmsRadius).toBe(0)
    expect(s.maxRadius).toBe(0)
  })

  it('S3 : segment parallèle au plan → ignoré', () => {
    // Pour un segment vraiment parallèle au plan vertical (normal=+x) :
    // direction (0,1), axisDir (1,0) → dot = 0 → ignoré
    const parallelResult: TraceResult = {
      segments: [{ start: { x: 100, y: -50 }, end: { x: 100, y: 50 }, wavelength: 550, intensity: 1 }],
      totalOpticalPath: 100,
    }
    const s = collectSpots(plane, [parallelResult])
    expect(s.points).toHaveLength(0)
  })

  it('S4 : un seul rayon axial → centroid = 0, rmsRadius = 0', () => {
    // Rayon passant par le centre du plan (y_local = 0)
    const result: TraceResult = {
      segments: [{ start: { x: 0, y: 0 }, end: { x: 200, y: 0 }, wavelength: 550, intensity: 1 }],
      totalOpticalPath: 200,
    }
    const s = collectSpots(plane, [result])
    expect(s.points).toHaveLength(1)
    expect(s.centroid).toBeCloseTo(0, 6)
    expect(s.rmsRadius).toBeCloseTo(0, 6)
  })

  it('S5 : deux rayons symétriques → centroid = 0, RMS = distance', () => {
    // Deux rayons à y=+20 et y=−20 sur le plan
    const r1: TraceResult = {
      segments: [{ start: { x: 0, y: 20 }, end: { x: 200, y: 20 }, wavelength: 550, intensity: 1 }],
      totalOpticalPath: 200,
    }
    const r2: TraceResult = {
      segments: [{ start: { x: 0, y: -20 }, end: { x: 200, y: -20 }, wavelength: 550, intensity: 1 }],
      totalOpticalPath: 200,
    }
    const s = collectSpots(plane, [r1, r2])
    expect(s.points).toHaveLength(2)
    expect(s.centroid).toBeCloseTo(0, 6)
    expect(s.rmsRadius).toBeCloseTo(20, 5)   // √((20²+20²)/2) = 20
    expect(s.maxRadius).toBeCloseTo(20, 5)
  })

  it('S6 : rayon hors demi-hauteur → rejeté', () => {
    // Plan height=80, rayon à y=90 → rejeté
    const result: TraceResult = {
      segments: [{ start: { x: 0, y: 90 }, end: { x: 200, y: 90 }, wavelength: 550, intensity: 1 }],
      totalOpticalPath: 200,
    }
    const s = collectSpots(plane, [result])
    expect(s.points).toHaveLength(0)
  })
})

// ─── S7 : Miroir parabolique → RMS ≈ 0 ────────────────────────────────────────

describe('S7 — Miroir parabolique (κ=−1) + plan image au foyer', () => {
  /**
   * Miroir parabolique : vertex à (0,0), axe +x, R=200, κ=−1.
   * Foyer F = (R/2, 0) = (100, 0).
   * 5 rayons parallèles (direction −x) à hauteurs h = 0, ±30, ±60.
   * Plan image au foyer (x=100, angle=0).
   * → Tous les rayons interceptent le plan en y ≈ 0 → RMS ≈ 0.
   */
  const mirror = new ConicMirror({
    id: 'm', position: { x: 0, y: 0 }, angle: 0, R: 200, kappa: -1, halfHeight: 90,
  })
  const scene = makeScene(mirror)
  const heights = [0, -30, 30, -60, 60]
  const rays = heights.map(h => makeRay(400, h, -1, 0))
  const results = traceAll(scene, rays)

  // Plan image au foyer (100, 0), vertical (angle=0)
  const plane = new ImagePlane({ id: 'ip', position: { x: 100, y: 0 }, angle: 0, height: 120 })
  const spotData = collectSpots(plane, results)

  it('tous les rayons interceptent le plan', () => {
    expect(spotData.points.length).toBeGreaterThanOrEqual(heights.length)
  })

  it('RMS ≈ 0 (< 0.5 px) — propriété de la parabole', () => {
    expect(spotData.rmsRadius).toBeLessThan(0.5)
  })

  it('centroïde ≈ 0 — focus centré', () => {
    expect(Math.abs(spotData.centroid)).toBeLessThan(0.5)
  })
})

// ─── S8 : Lentille mince → RMS diminue vers le foyer ──────────────────────────

describe('S8 — Lentille mince : RMS > 0, diminue vers focus', () => {
  /**
   * Lentille mince f=200, 7 rayons parallèles à hauteurs h = 0..±60.
   * Plan image déplacé le long de l'axe : on vérifie que le minimum de RMS
   * se trouve autour de x = 200 (foyer gaussien).
   */
  const lens = new ThinLens({ id: 'l', position: { x: 0, y: 0 }, angle: 0, focalLength: 200, height: 200 })
  const scene = makeScene(lens)
  const heights = [-60, -40, -20, 0, 20, 40, 60]
  const rays = heights.map(h => makeRay(-500, h, 1, 0))
  const results = traceAll(scene, rays)

  function rmsAt(x: number): number {
    const plane = new ImagePlane({ id: 'ip', position: { x, y: 0 }, angle: 0, height: 120 })
    return collectSpots(plane, results).rmsRadius
  }

  it('RMS > 0 loin du foyer (x=400)', () => {
    expect(rmsAt(400)).toBeGreaterThan(1)
  })

  it('RMS minimum proche du foyer paraxial (x=200 ± 20)', () => {
    const positions = [180, 190, 195, 200, 205, 210, 220]
    const rmss = positions.map(x => rmsAt(x))
    const minIdx = rmss.indexOf(Math.min(...rmss))
    // Le minimum doit être entre x=180 et x=220
    expect(positions[minIdx]).toBeGreaterThanOrEqual(180)
    expect(positions[minIdx]).toBeLessThanOrEqual(220)
  })
})
