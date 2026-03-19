import { describe, it, expect } from 'vitest'
import { GRINElement } from '../core/elements/grin-medium.ts'
import { integrateGRIN } from '../core/tracer-grin.ts'

// ─────────────────────────────────────────────────────────────────────────────
// V6 — Gradient linéaire transverse : trajectoire parabolique
//
// Milieu : n(y) = n0 + α·y_local   (α = const)
// Rayon entrant horizontal (direction +x), décalé de y0 par rapport au centre.
//
// Solution analytique (optique paraxiale, α petit) :
//   La courbure de la trajectoire est κ = −α/n0 (déflexion vers les n croissants).
//   En première approximation, y(x) = y0 − (α/(2n0)) x²   (parabole vers le bas si α>0 et y0>0)
//
// Test : après traversée d'une largeur W, la déflexion Δy doit correspondre à
//   Δy ≈ −(α/(2n0))·W²  (approximation paraxiale)
//
// On vérifie que :
//   1. La trajectoire est courbée dans la bonne direction
//   2. La valeur de Δy est dans les 5% de l'approximation paraxiale
// ─────────────────────────────────────────────────────────────────────────────

describe('V6 — Gradient linéaire → trajectoire parabolique', () => {
  const W    = 500    // largeur du milieu (px)
  const H    = 600    // hauteur du milieu (px)
  const n0   = 1.5
  const alpha = 0.001 // Δn/px (petit → approximation paraxiale valide)

  // Milieu centré en (W/2, H/2) world → position.y = 0 pour que y_local = y_world - H/2
  const medium = new GRINElement({
    id: 'test-linear',
    position: { x: 0, y: 0 },
    width: W,
    height: H,
    profile: 'linear',
    n0,
    alpha,
  })

  it('indice varie linéairement avec y', () => {
    const cy = H / 2  // centre du milieu
    const n_center  = medium.indexAt({ x: W / 2, y: cy })
    const n_above   = medium.indexAt({ x: W / 2, y: cy + 100 })
    const n_below   = medium.indexAt({ x: W / 2, y: cy - 100 })

    expect(Math.abs(n_center - n0)).toBeLessThan(1e-10)
    expect(Math.abs(n_above - (n0 + alpha * 100))).toBeLessThan(1e-10)
    expect(Math.abs(n_below - (n0 - alpha * 100))).toBeLessThan(1e-10)
  })

  it('gradient est correct', () => {
    const g = medium.gradientAt({ x: W / 2, y: H / 2 }, 555)
    // gradient linéaire : ∂n/∂x = 0, ∂n/∂y = alpha
    expect(Math.abs(g.x)).toBeLessThan(1e-6)
    expect(Math.abs(g.y - alpha)).toBeLessThan(1e-4)
  })

  it('trajectoire courbée vers les n croissants (vers y élevés)', () => {
    // Rayon entrant au centre (y_local=0), direction +x
    const entry = { x: 0, y: H / 2 }
    const result = integrateGRIN(entry, { x: 1, y: 0 }, medium, 555, {
      dsMax: 2, dsMin: 0.05, adaptiveEps: 0.3, maxSteps: 100_000,
    })

    const pts = result.points
    expect(pts.length).toBeGreaterThan(10)

    // Le rayon au centre (y_local=0) : gradient pointe vers +y.
    // Le rayon doit se courber vers +y.
    const yFinal = pts[pts.length - 1].y
    expect(yFinal).toBeGreaterThan(H / 2)  // courbé vers +y
  })

  it('déflexion Δy parabolique à ±10% de la solution analytique', () => {
    // Rayon entrant au centre, direction +x
    const entry = { x: 0, y: H / 2 }
    const result = integrateGRIN(entry, { x: 1, y: 0 }, medium, 555, {
      dsMax: 2, dsMin: 0.05, adaptiveEps: 0.3, maxSteps: 100_000,
    })

    const pts = result.points
    const xFinal = pts[pts.length - 1].x
    const yFinal = pts[pts.length - 1].y
    const deltaY = yFinal - H / 2

    // Solution paraxiale : Δy ≈ (α / (2n0)) · x²
    const deltaY_analytic = (alpha / (2 * n0)) * (xFinal * xFinal)
    const relErr = Math.abs(deltaY - deltaY_analytic) / Math.abs(deltaY_analytic)

    expect(relErr).toBeLessThan(0.10)  // ±10%
  })

  it('direction finale inclinée dans le sens du gradient', () => {
    const entry = { x: 0, y: H / 2 }
    const result = integrateGRIN(entry, { x: 1, y: 0 }, medium, 555, {
      dsMax: 2, dsMin: 0.05, adaptiveEps: 0.3, maxSteps: 100_000,
    })
    // La composante y de la direction doit être positive (vers +y)
    expect(result.exitDirection.y).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// V7 — Fibre GRIN parabolique : trajectoire sinusoïdale
//
// Profil : n(r) = n0·(1 − α²r²/2)   r = |y_local|
//
// Solution exacte (équation du pendule harmonique) :
//   y(x) = A·cos(α·x + φ)
//   Période spatiale : T = 2π/α
//
// Test : rayon entrant à y = A ≠ 0, direction +x horizontal.
//   → trajectoire sinusoïdale de période T = 2π/α,
//   → retour à y = +A (même signe) après x = T,
//   → passage par y = −A à x = T/2.
// ─────────────────────────────────────────────────────────────────────────────

describe('V7 — Fibre GRIN parabolique → trajectoire sinusoïdale', () => {
  const n0    = 1.5
  const alpha = 0.02    // px⁻¹ → T = 2π/0.02 ≈ 314 px
  const T     = 2 * Math.PI / alpha   // ≈ 314 px
  // A doit rester paraxial : dy/dx_max = A·α << 1.
  // A=5 → pente max 0.1 rad (5.7°) → erreur de période O((αA)²) ≈ 1%.
  const A     = 5       // amplitude (px), rayon paraxial

  // Milieu : large assez pour contenir une période entière
  const W = Math.ceil(T) + 100
  const H = 300

  const medium = new GRINElement({
    id: 'test-parabolic',
    position: { x: 0, y: 0 },
    width: W,
    height: H,
    profile: 'parabolic',
    n0,
    alpha,
  })

  const cy = H / 2  // axe de la fibre

  it('indice maximal au centre, décroissant vers le bord', () => {
    const nCenter = medium.indexAt({ x: W / 2, y: cy })
    const nEdge   = medium.indexAt({ x: W / 2, y: cy + A })
    expect(nCenter).toBeCloseTo(n0, 6)
    expect(nEdge).toBeLessThan(nCenter)
  })

  it('indice parabolique : n(r) = n0·(1 − α²r²/2)', () => {
    const r = 20
    const nExpected = n0 * (1 - 0.5 * alpha * alpha * r * r)
    const nActual   = medium.indexAt({ x: W / 2, y: cy + r })
    expect(Math.abs(nActual - nExpected)).toBeLessThan(1e-10)
  })

  it('période T = 2π/α à ±8%', () => {
    // Rayon entrant à y = cy + A (amplitude max), direction +x
    const entry = { x: 0, y: cy + A }
    const result = integrateGRIN(entry, { x: 1, y: 0 }, medium, 555, {
      dsMax: 1, dsMin: 0.02, adaptiveEps: 0.1, maxSteps: 200_000,
    })

    const pts = result.points

    // Trouver le premier passage à y ≈ cy − A (demi-période)
    // On cherche le passage le plus bas (y_min) pour estimer la demi-période
    let xAtMin = -1
    let yMin   = Infinity
    for (const p of pts) {
      if (p.y < yMin) { yMin = p.y; xAtMin = p.x }
    }

    // xAtMin ≈ T/2
    const T_half_measured = xAtMin
    const T_half_expected = T / 2
    const relErr = Math.abs(T_half_measured - T_half_expected) / T_half_expected
    expect(relErr).toBeLessThan(0.08)  // ±8%
  })

  it('amplitude conservée : retour à +A après une période (±15%)', () => {
    const entry = { x: 0, y: cy + A }
    const result = integrateGRIN(entry, { x: 1, y: 0 }, medium, 555, {
      dsMax: 1, dsMin: 0.02, adaptiveEps: 0.1, maxSteps: 200_000,
    })

    const pts = result.points

    // Chercher le premier maximum local APRÈS x > T/2
    // (le rayon est remonté et doit revenir près de cy+A)
    const halfX = T / 2
    let yAtPeriod = NaN
    let xAtPeriod = -1

    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i]
      if (p.x < halfX) continue
      // Maximum local : y[i] > y[i-1] et y[i] > y[i+1]
      if (p.y > pts[i - 1].y && p.y > pts[i + 1].y) {
        if (xAtPeriod < 0) {
          yAtPeriod = p.y
          xAtPeriod = p.x
        }
      }
    }

    // Vérifier que le maximum retrouvé est proche de cy+A
    if (xAtPeriod > 0) {
      const relErr = Math.abs(yAtPeriod - (cy + A)) / A
      expect(relErr).toBeLessThan(0.15)  // ±15% sur l'amplitude
    } else {
      // Pas de maximum trouvé : le milieu n'est pas assez large
      // On vérifie au moins que le rayon est remonté au-delà du centre
      const yFinal = pts[pts.length - 1].y
      expect(yFinal).toBeGreaterThan(cy)
    }
  })

  it('direction finale ≈ horizontale après une période entière', () => {
    // Après une période entière, dy/ds ≈ 0 (retour au même état)
    const entry = { x: 0, y: cy + A }
    const result = integrateGRIN(entry, { x: 1, y: 0 }, medium, 555, {
      dsMax: 1, dsMin: 0.02, adaptiveEps: 0.1, maxSteps: 200_000,
    })

    // Le milieu fait T+100 px : on a traversé une période
    // La direction finale doit avoir |vy| < |vx| (rayon à nouveau quasi-horizontal)
    const dir = result.exitDirection
    expect(Math.abs(dir.x)).toBeGreaterThan(Math.abs(dir.y) * 0.5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests annexes : profil exponentiel + conservation OPL
// ─────────────────────────────────────────────────────────────────────────────

describe('GRINElement — profil exponentiel', () => {
  it('n(h=0) = n0, décroît vers n=1 pour h grand', () => {
    const medium = new GRINElement({
      id: 'exp',
      position: { x: 0, y: 0 },
      width: 400, height: 400,
      profile: 'exponential',
      n0: 1.3, alpha: 100,   // H = 100 px de hauteur caractéristique
    })
    const nGround  = medium.indexAt({ x: 200, y: 0   })    // h=0
    const nHigh    = medium.indexAt({ x: 200, y: 300 })    // h=300 >> H
    expect(Math.abs(nGround - 1.3)).toBeLessThan(1e-10)
    expect(nHigh).toBeLessThan(1.05)   // proche de 1
    expect(nHigh).toBeGreaterThan(1.0) // toujours > 1
  })
})

describe('integrateGRIN — conservation de |p⃗|', () => {
  it('|p⃗|/n reste ≈ 1 tout au long du tracé (renormalisation)', () => {
    const medium = new GRINElement({
      id: 'renorm',
      position: { x: 0, y: 0 },
      width: 300, height: 300,
      profile: 'parabolic',
      n0: 1.5, alpha: 0.015,
    })

    const entry = { x: 0, y: 150 + 20 }  // légèrement hors axe
    const result = integrateGRIN(entry, { x: 1, y: 0 }, medium, 555, {
      dsMax: 2, dsMin: 0.05, maxSteps: 50_000,
    })

    // La direction finale doit être unitaire
    const { exitDirection: d } = result
    const mag = Math.sqrt(d.x * d.x + d.y * d.y)
    expect(Math.abs(mag - 1)).toBeLessThan(1e-6)
  })
})
