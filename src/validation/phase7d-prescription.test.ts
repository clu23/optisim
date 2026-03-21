/**
 * Validation physique — Phase 7D — Tableau de prescription
 *
 * PR1  buildPrescription — ThickLens : 2 lignes, R1/R2 corrects
 * PR2  buildPrescription — épaisseur = distance inter-vertex
 * PR3  buildPrescription — scène multi-éléments triée par x
 * PR4  buildPrescription — ApertureElement : type='stop', clearRadius
 * PR5  buildPrescription — ImagePlane : type='image', dernière ligne
 * PR6  prescriptionToCSV — format CSV valide (header + lignes)
 * PR7  buildPrescription — glassId → nD et Abbe corrects (N-BK7)
 */

import { describe, it, expect } from 'vitest'
import { buildPrescription, prescriptionToCSV } from '../core/prescription.ts'
import { ThickLens } from '../core/elements/thick-lens.ts'
import { ApertureElement } from '../core/elements/aperture.ts'
import { ImagePlane } from '../core/elements/image-plane.ts'
import { FlatMirror } from '../core/elements/flat-mirror.ts'
import type { Scene } from '../core/types.ts'

function makeScene(...elements: Scene['elements']): Scene {
  return { elements, sources: [], metadata: { name: 'test' } }
}

// ─── PR1 : ThickLens — 2 lignes avec R corrects ──────────────────────────

describe('PR1 — ThickLens génère 2 lignes', () => {
  const lens = new ThickLens({
    id: 'l1', position: { x: 200, y: 0 }, angle: 0,
    R1: 100, R2: 80, thickness: 20, halfHeight: 30, n: 1.5, label: 'L1',
  })
  const table = buildPrescription(makeScene(lens))

  it('2 lignes de surface', () => {
    expect(table.rows).toHaveLength(2)
  })

  it('S1 — R = R1 (convention standard)', () => {
    expect(table.rows[0].radius).toBeCloseTo(100, 3)
    expect(table.rows[0].kappa).toBe(0)
  })

  it('S2 — R = -R2 (convention standard inversée)', () => {
    expect(table.rows[1].radius).toBeCloseTo(-80, 3)
  })

  it('S1 — matériau = verre (après la surface)', () => {
    expect(table.rows[0].material).toContain('n=')
  })

  it('S2 — matériau = AIR', () => {
    expect(table.rows[1].material).toBe('AIR')
  })

  it('S1 — type = refract', () => {
    expect(table.rows[0].type).toBe('refract')
  })
})

// ─── PR2 : Épaisseur inter-vertex ────────────────────────────────────────

describe('PR2 — Épaisseur = distance inter-vertex', () => {
  const lens = new ThickLens({
    id: 'l1', position: { x: 200, y: 0 }, angle: 0,
    R1: 100, R2: 100, thickness: 20, halfHeight: 30, n: 1.5, label: 'L1',
  })
  const table = buildPrescription(makeScene(lens))

  it('Épaisseur S1→S2 ≈ thickness (20 px)', () => {
    // vertex1 = center - thickness/2 → vertex2 = center + thickness/2
    // distance = thickness = 20 px
    expect(table.rows[0].thickness).toBeCloseTo(20, 1)
  })

  it('Épaisseur S2 = Infinity (dernière surface)', () => {
    expect(table.rows[1].thickness).toBe(Infinity)
  })
})

// ─── PR3 : Multi-éléments triés par x ────────────────────────────────────

describe('PR3 — Scène multi-éléments triée par x', () => {
  // Miroir à x=100, Lentille à x=300 (vertex1=290, vertex2=310)
  const mirror = new FlatMirror({
    id: 'm1', position: { x: 100, y: 0 }, angle: 0, length: 60, label: 'M',
  })
  const lens = new ThickLens({
    id: 'l1', position: { x: 300, y: 0 }, angle: 0,
    R1: 100, R2: 100, thickness: 20, halfHeight: 30, n: 1.5, label: 'L1',
  })
  const table = buildPrescription(makeScene(lens, mirror))  // ordre inversé

  it('3 lignes (1 miroir + 2 surfaces lentille)', () => {
    expect(table.rows).toHaveLength(3)
  })

  it('Première ligne = miroir (x=100)', () => {
    expect(table.rows[0].elementId).toBe('m1')
    expect(table.rows[0].type).toBe('reflect')
  })

  it('Deuxième ligne = L1-S1 (vertex ≈ x=290)', () => {
    expect(table.rows[1].elementId).toBe('l1')
    expect(table.rows[1].type).toBe('refract')
  })
})

// ─── PR4 : ApertureElement ────────────────────────────────────────────────

describe('PR4 — ApertureElement dans la prescription', () => {
  const ap = new ApertureElement({
    id: 'ap1', position: { x: 0, y: 0 }, angle: 0,
    diameter: 100, clearRadius: 20, label: 'Stop',
  })
  const table = buildPrescription(makeScene(ap))

  it('1 ligne de type "stop"', () => {
    expect(table.rows).toHaveLength(1)
    expect(table.rows[0].type).toBe('stop')
  })

  it('clearRadius correct', () => {
    expect(table.rows[0].clearRadius).toBeCloseTo(20, 1)
  })
})

// ─── PR5 : ImagePlane ─────────────────────────────────────────────────────

describe('PR5 — ImagePlane dans la prescription', () => {
  const ip = new ImagePlane({
    id: 'img', position: { x: 500, y: 0 }, angle: 0, height: 50, label: 'Image',
  })
  const table = buildPrescription(makeScene(ip))

  it('type = "image"', () => {
    expect(table.rows[0].type).toBe('image')
  })

  it('épaisseur = Infinity (dernière surface)', () => {
    expect(table.rows[0].thickness).toBe(Infinity)
  })
})

// ─── PR6 : Export CSV ─────────────────────────────────────────────────────

describe('PR6 — prescriptionToCSV', () => {
  const lens = new ThickLens({
    id: 'l1', position: { x: 0, y: 0 }, angle: 0,
    R1: 100, R2: 80, thickness: 20, halfHeight: 30, n: 1.5, label: 'L1',
  })
  const table = buildPrescription(makeScene(lens))
  const csv   = prescriptionToCSV(table)

  it('contient un header', () => {
    const firstLine = csv.split('\r\n')[0]
    expect(firstLine).toContain('Surface')
    expect(firstLine).toContain('Rayon')
    expect(firstLine).toContain('Épaisseur')
  })

  it('contient autant de lignes de données que de surfaces', () => {
    const lines = csv.split('\r\n').filter(l => l.trim().length > 0)
    // header + 2 surfaces
    expect(lines).toHaveLength(3)
  })

  it('les lignes sont séparées par virgule', () => {
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine.split(',').length).toBeGreaterThanOrEqual(9)
  })
})

// ─── PR7 : glassId → nD et Abbe corrects ─────────────────────────────────

describe('PR7 — glassId N-BK7 dans la prescription', () => {
  const lens = new ThickLens({
    id: 'l1', position: { x: 0, y: 0 }, angle: 0,
    R1: 100, R2: 80, thickness: 20, halfHeight: 30, n: 1.5,
    glassId: 'N-BK7', label: 'L1',
  })
  const table = buildPrescription(makeScene(lens))
  const s1 = table.rows[0]

  it('matériau = N-BK7', () => {
    expect(s1.material).toBe('N-BK7')
  })

  it('nD ≈ 1.5168 (Schott)', () => {
    expect(s1.nD).toBeCloseTo(1.5168, 3)
  })

  it('Abbe ≈ 64.2 (Schott)', () => {
    expect(s1.abbeNumber!).toBeCloseTo(64.2, 0)
  })
})
