/**
 * Tests unitaires — core/dispersion.ts
 *
 * Vérifie la loi de Cauchy et la base de matériaux :
 *  - valeurs aux 3 raies de Fraunhofer (λF=486.1 nm, λD=589.3 nm, λC=656.3 nm)
 *  - dispersion normale (n croissant quand λ décroît)
 *  - cohérence des données du catalogue
 */

import { describe, it, expect } from 'vitest'
import { cauchyIndex, materialIndex, referenceIndex, MATERIALS, type MaterialId } from './dispersion.ts'

// Raies de Fraunhofer (nm)
const WL_F = 486.1
const WL_D = 589.3
const WL_C = 656.3

// Tolérance : fit exact → erreur machine ~1e-10 ; on utilise 1e-4 pour robustesse
const EPS = 1e-4

// ─── Loi de Cauchy — formule ─────────────────────────────────────────────────

describe('cauchyIndex — formule de Cauchy', () => {
  it('C=0 : n = A + B/λ²', () => {
    // λ=500nm → λ_µm=0.5, l2=0.25 → n = 1.5 + 0.005/0.25 = 1.52
    const n = cauchyIndex({ A: 1.5, B: 0.005, C: 0 }, 500)
    expect(n).toBeCloseTo(1.52, 10)
  })

  it('C≠0 : n = A + B/λ² + C/λ⁴', () => {
    // λ=500nm → l2=0.25, l4=0.0625
    // n = 1.5 + 0.005/0.25 + 0.0001/0.0625 = 1.5 + 0.02 + 0.0016 = 1.5216
    const n = cauchyIndex({ A: 1.5, B: 0.005, C: 0.0001 }, 500)
    expect(n).toBeCloseTo(1.5216, 4)
  })

  it('dispersion normale : n(bleu) > n(rouge) pour BK7', () => {
    const nBlue = cauchyIndex(MATERIALS['BK7'], 450)
    const nRed  = cauchyIndex(MATERIALS['BK7'], 650)
    expect(nBlue).toBeGreaterThan(nRed)
  })

  it('monotone décroissant en λ sur 380–780 nm (BK7)', () => {
    const wls = [380, 450, 500, 550, 600, 650, 700, 780]
    for (let i = 1; i < wls.length; i++) {
      expect(cauchyIndex(MATERIALS['BK7'], wls[i - 1])).toBeGreaterThan(cauchyIndex(MATERIALS['BK7'], wls[i]))
    }
  })
})

// ─── Indices de référence aux raies de Fraunhofer ────────────────────────────
//
// Valeurs source : Schott datasheet (BK7, SF11), CRC Handbook (eau), manuels (diamant)
// Les coefficients de MATERIALS sont fittés exactement sur ces 3 points.
// ─────────────────────────────────────────────────────────────────────────────

const FRAUNHOFER_REFS: Record<MaterialId, { F: number; D: number; C: number }> = {
  BK7:     { F: 1.5224, D: 1.5168, C: 1.5143 },
  SF11:    { F: 1.8065, D: 1.7847, C: 1.7786 },
  water:   { F: 1.3372, D: 1.3330, C: 1.3312 },
  diamond: { F: 2.4354, D: 2.4175, C: 2.4099 },
}

describe('materialIndex — raies de Fraunhofer (fit exact ±1e-4)', () => {
  for (const [id, ref] of Object.entries(FRAUNHOFER_REFS) as [MaterialId, typeof FRAUNHOFER_REFS[MaterialId]][]) {
    it(`${id} : n(λF=486.1 nm) = ${ref.F} ±${EPS}`, () => {
      expect(Math.abs(materialIndex(id, WL_F) - ref.F)).toBeLessThan(EPS)
    })
    it(`${id} : n(λD=589.3 nm) = ${ref.D} ±${EPS}`, () => {
      expect(Math.abs(materialIndex(id, WL_D) - ref.D)).toBeLessThan(EPS)
    })
    it(`${id} : n(λC=656.3 nm) = ${ref.C} ±${EPS}`, () => {
      expect(Math.abs(materialIndex(id, WL_C) - ref.C)).toBeLessThan(EPS)
    })
  }
})

describe('materialIndex — propriétés physiques', () => {
  it('SF11 a un indice plus élevé que BK7 (flint > crown)', () => {
    expect(materialIndex('SF11', WL_D)).toBeGreaterThan(materialIndex('BK7', WL_D))
  })

  it('eau a un indice plus faible que BK7', () => {
    expect(materialIndex('water', WL_D)).toBeLessThan(materialIndex('BK7', WL_D))
  })

  it('diamant a le plus grand indice du catalogue', () => {
    const ids = Object.keys(MATERIALS) as MaterialId[]
    const nDiamond = materialIndex('diamond', WL_D)
    for (const id of ids.filter(i => i !== 'diamond')) {
      expect(nDiamond).toBeGreaterThan(materialIndex(id, WL_D))
    }
  })

  it('tous les matériaux ont n > 1 sur 380–780 nm', () => {
    const ids = Object.keys(MATERIALS) as MaterialId[]
    for (const id of ids) {
      for (const wl of [380, 450, 550, 650, 780]) {
        expect(materialIndex(id, wl)).toBeGreaterThan(1)
      }
    }
  })

  it('dispersion normale : n décroissant avec λ pour tous les matériaux', () => {
    const ids = Object.keys(MATERIALS) as MaterialId[]
    for (const id of ids) {
      expect(materialIndex(id, 450)).toBeGreaterThan(materialIndex(id, 650))
    }
  })
})

// ─── referenceIndex ──────────────────────────────────────────────────────────

describe('referenceIndex — indice à 550 nm', () => {
  it('BK7 à 550 nm est supérieur à son indice à 700 nm', () => {
    expect(referenceIndex('BK7')).toBeGreaterThan(materialIndex('BK7', 700))
  })

  it('cohérent avec materialIndex(id, 550)', () => {
    const ids = Object.keys(MATERIALS) as MaterialId[]
    for (const id of ids) {
      expect(referenceIndex(id)).toBeCloseTo(materialIndex(id, 550), 10)
    }
  })
})

// ─── Catalogue MATERIALS ─────────────────────────────────────────────────────

describe('MATERIALS — cohérence du catalogue', () => {
  it('tous les matériaux ont A, B, C numériques', () => {
    for (const [, m] of Object.entries(MATERIALS)) {
      expect(typeof m.A).toBe('number')
      expect(typeof m.B).toBe('number')
      expect(typeof m.C).toBe('number')
    }
  })

  it('tous les matériaux ont un label non-vide', () => {
    for (const [, m] of Object.entries(MATERIALS)) {
      expect(m.label.length).toBeGreaterThan(0)
    }
  })

  it('nD catalogué cohérent avec cauchyIndex à 589.3 nm (±1e-4)', () => {
    for (const [, m] of Object.entries(MATERIALS)) {
      const nCalc = cauchyIndex(m, WL_D)
      expect(Math.abs(nCalc - m.nD)).toBeLessThan(EPS)
    }
  })
})
