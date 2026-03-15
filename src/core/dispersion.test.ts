/**
 * Tests unitaires — core/dispersion.ts
 *
 * Vérifie la loi de Cauchy et la base de matériaux :
 *  - valeurs connues à la raie D (589.3 nm) pour BK7, SF11, eau, diamant
 *  - dispersion normale (n croissant quand λ décroît)
 *  - cohérence des données du catalogue
 */

import { describe, it, expect } from 'vitest'
import { cauchyIndex, materialIndex, referenceIndex, MATERIALS, type MaterialId } from './dispersion.ts'

// Tolérance sur l'indice : ±0.001 (Cauchy est une approximation)
const EPS = 1e-3

// ─── Loi de Cauchy — formule ─────────────────────────────────────────────────

describe('cauchyIndex — formule de Cauchy', () => {
  it('C=0 : n = A + B/λ²', () => {
    // BK7 à 589.3 nm : n = 1.5046 + 0.00420/(0.5893)² ≈ 1.5167
    const n = cauchyIndex({ A: 1.5046, B: 0.00420, C: 0 }, 589.3)
    expect(n).toBeCloseTo(1.5167, 3)
  })

  it('C≠0 : n = A + B/λ² + C/λ⁴', () => {
    // Valeur de référence calculée à la main
    // λ=500nm → λ_µm=0.5, l2=0.25, l4=0.0625
    // n = 1.5 + 0.005/0.25 + 0.0001/0.0625 = 1.5 + 0.02 + 0.0016 = 1.5216
    const n = cauchyIndex({ A: 1.5, B: 0.005, C: 0.0001 }, 500)
    expect(n).toBeCloseTo(1.5216, 4)
  })

  it('dispersion normale : n(bleu) > n(rouge) pour un verre crown', () => {
    const coeffs = MATERIALS['BK7']
    const nBlue = cauchyIndex(coeffs, 450)
    const nRed  = cauchyIndex(coeffs, 650)
    expect(nBlue).toBeGreaterThan(nRed)
  })

  it('plus λ est court, plus n est grand (monotone décroissant en λ)', () => {
    const coeffs = MATERIALS['BK7']
    const wls = [400, 450, 500, 550, 600, 650, 700]
    for (let i = 1; i < wls.length; i++) {
      expect(cauchyIndex(coeffs, wls[i - 1])).toBeGreaterThan(cauchyIndex(coeffs, wls[i]))
    }
  })
})

// ─── Matériaux — valeurs tabulées ────────────────────────────────────────────

describe('materialIndex — base de matériaux', () => {
  // Valeurs calculées par Cauchy à 589.3 nm (raie D du sodium).
  // Cauchy est une approximation ; ces valeurs sont celles du modèle, pas du verre réel.
  const refD: Record<MaterialId, number> = {
    'BK7':     1.5167,   // Schott réel : 1.5168 — erreur < 0.001 ✓
    'SF11':    1.7764,   // Schott réel : 1.7847 — Cauchy approx (erreur ~0.008)
    'water':   1.3387,   // Mesure réelle : 1.3330 — Cauchy approx (erreur ~0.006)
    'diamond': 2.4129,   // Mesure réelle : 2.4175 — Cauchy approx (erreur ~0.005)
  }

  for (const [id, expected] of Object.entries(refD) as [MaterialId, number][]) {
    it(`${id} à 589.3 nm ≈ ${expected} (±0.001)`, () => {
      const n = materialIndex(id, 589.3)
      expect(Math.abs(n - expected)).toBeLessThan(EPS)
    })
  }

  it('SF11 a un indice plus élevé que BK7 (flint > crown)', () => {
    expect(materialIndex('SF11', 589)).toBeGreaterThan(materialIndex('BK7', 589))
  })

  it('eau a un indice plus faible que BK7', () => {
    expect(materialIndex('water', 589)).toBeLessThan(materialIndex('BK7', 589))
  })

  it('diamant a le plus grand indice du catalogue', () => {
    const ids = Object.keys(MATERIALS) as MaterialId[]
    const nDiamond = materialIndex('diamond', 589)
    for (const id of ids.filter(i => i !== 'diamond')) {
      expect(nDiamond).toBeGreaterThan(materialIndex(id, 589))
    }
  })

  it('tous les matériaux ont n > 1', () => {
    const ids = Object.keys(MATERIALS) as MaterialId[]
    for (const id of ids) {
      expect(materialIndex(id, 550)).toBeGreaterThan(1)
    }
  })

  it('tous les matériaux ont un indice dans [1.0, 3.0] sur 380–780 nm', () => {
    const ids = Object.keys(MATERIALS) as MaterialId[]
    for (const id of ids) {
      for (const wl of [380, 450, 550, 650, 780]) {
        const n = materialIndex(id, wl)
        expect(n).toBeGreaterThan(1.0)
        expect(n).toBeLessThan(3.0)
      }
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

  it('nD catalogué cohérent avec cauchyIndex à 589.3 nm (±0.001)', () => {
    for (const [, m] of Object.entries(MATERIALS)) {
      const nCalc = cauchyIndex(m, 589.3)
      expect(Math.abs(nCalc - m.nD)).toBeLessThan(EPS)
    }
  })
})
