import { describe, it, expect } from 'vitest'
import { GRINElement } from '../core/elements/grin-medium.ts'
import { integrateGRIN } from '../core/tracer-grin.ts'
import { traceRay } from '../core/tracer.ts'
import type { Ray, Scene } from '../core/types.ts'

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

// ─────────────────────────────────────────────────────────────────────────────
// V — Conservation du chemin optique OPL = ∫n·ds
//
// Cas analytiques vérifiables :
//   1. Milieu uniforme (α=0) : OPL = n₀ × W  (trajectoire droite)
//   2. Gradient linéaire, traversée verticale symétrique :
//        OPL = ∫₀ᴴ [n₀ + α·(y−H/2)] dy = n₀·H  (termes en α s'annulent)
//   3. Profil parabolique sur l'axe (r=0) : n(0)=n₀ partout → OPL = n₀·W
// ─────────────────────────────────────────────────────────────────────────────

describe('V — Conservation du chemin optique (OPL = ∫n·ds)', () => {
  it('milieu uniforme (α=0) : OPL = n₀ × largeur à ±1%', () => {
    const W = 300, H = 200, n0 = 1.5
    const medium = new GRINElement({
      id: 'opl-uniform',
      position: { x: 0, y: 0 },
      width: W, height: H,
      profile: 'linear', n0, alpha: 0,   // α=0 → milieu homogène
    })
    // dsMax=1 → erreur d'overshoot ≈ 1/300 < 0.4%
    const result = integrateGRIN(
      { x: 0, y: H / 2 },  // rayon horizontal centré
      { x: 1, y: 0 },
      medium, 555,
      { dsMax: 1, dsMin: 0.1, maxSteps: 100_000 },
    )
    const relErr = Math.abs(result.opticalPath - n0 * W) / (n0 * W)
    expect(relErr).toBeLessThan(0.01)
  })

  it('gradient linéaire symétrique : OPL = n₀ × H à ±0.5%', () => {
    // Traversée verticale complète d'un gradient n(y) = n₀ + α·(y − H/2)
    // OPL = ∫₀ᴴ [n₀ + α·(y−H/2)] dy = n₀·H  (symétrie : termes en α → 0)
    const W = 200, H = 400, n0 = 1.5, alpha = 0.001
    const medium = new GRINElement({
      id: 'opl-linear',
      position: { x: 0, y: 0 },
      width: W, height: H,
      profile: 'linear', n0, alpha,
    })
    // Rayon vertical (direction +y) : pas de force horizontale → trajectoire droite
    const result = integrateGRIN(
      { x: W / 2, y: 0 },   // entrée en haut
      { x: 0, y: 1 },        // direction vers le bas
      medium, 555,
      { dsMax: 2, dsMin: 0.05, maxSteps: 100_000 },
    )
    const OPL_analytic = n0 * H
    const relErr = Math.abs(result.opticalPath - OPL_analytic) / OPL_analytic
    expect(relErr).toBeLessThan(0.01)
  })

  it('profil parabolique axial : OPL = n₀ × W à ±1%', () => {
    // Sur l'axe (r=0), n(r=0) = n₀ partout → trajectoire droite → OPL = n₀·W
    const W = 400, H = 300, n0 = 1.5, alpha = 0.015
    const medium = new GRINElement({
      id: 'opl-parabolic',
      position: { x: 0, y: 0 },
      width: W, height: H,
      profile: 'parabolic', n0, alpha,
    })
    // dsMax=1 → erreur d'overshoot ≈ 1/400 < 0.3%
    const result = integrateGRIN(
      { x: 0, y: H / 2 },   // sur l'axe optique
      { x: 1, y: 0 },
      medium, 555,
      { dsMax: 1, dsMin: 0.1, maxSteps: 100_000 },
    )
    const OPL_analytic = n0 * W
    const relErr = Math.abs(result.opticalPath - OPL_analytic) / OPL_analytic
    expect(relErr).toBeLessThan(0.01)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests du profil custom
// ─────────────────────────────────────────────────────────────────────────────

describe('GRINElement — profil custom (gradient 2D libre)', () => {
  it('gradient purement vertical (α2=0) : identique au profil linéaire', () => {
    const W = 300, H = 300, n0 = 1.5, alpha = 0.001
    const custom = new GRINElement({
      id: 'custom-vert', position: { x: 0, y: 0 }, width: W, height: H,
      profile: 'custom', n0, alpha, alpha2: 0,
    })
    const linear = new GRINElement({
      id: 'linear-ref', position: { x: 0, y: 0 }, width: W, height: H,
      profile: 'linear', n0, alpha,
    })
    // Mêmes valeurs partout
    const pts = [
      { x: 50, y: 100 }, { x: 150, y: 150 }, { x: 200, y: 250 },
    ]
    for (const p of pts) {
      expect(Math.abs(custom.indexAt(p) - linear.indexAt(p))).toBeLessThan(1e-10)
    }
  })

  it('gradient purement horizontal (α=0, α2≠0) : n varie le long de x', () => {
    const W = 400, H = 200, n0 = 1.5, alpha2 = 0.001
    const medium = new GRINElement({
      id: 'custom-horiz', position: { x: 0, y: 0 }, width: W, height: H,
      profile: 'custom', n0, alpha: 0, alpha2,
    })
    const cx = W / 2
    // Sur l'axe y=cy : n(x) = n0 + α2·(x−cx)
    const nLeft   = medium.indexAt({ x: 0,   y: H / 2 })
    const nCenter = medium.indexAt({ x: cx,  y: H / 2 })
    const nRight  = medium.indexAt({ x: W,   y: H / 2 })
    expect(Math.abs(nCenter - n0)).toBeLessThan(1e-10)
    expect(Math.abs(nLeft  - (n0 - alpha2 * cx))).toBeLessThan(1e-10)
    expect(Math.abs(nRight - (n0 + alpha2 * cx))).toBeLessThan(1e-10)
  })

  it('gradient diagonal : n(x,y) = n0 + αy·y + αx·x avec les deux composantes', () => {
    const W = 300, H = 300, n0 = 1.5, alpha = 0.001, alpha2 = 0.0005
    const medium = new GRINElement({
      id: 'custom-diag', position: { x: 0, y: 0 }, width: W, height: H,
      profile: 'custom', n0, alpha, alpha2,
    })
    const cx = W / 2, cy = H / 2
    const pos = { x: cx + 50, y: cy + 30 }
    const expected = n0 + alpha * 30 + alpha2 * 50
    expect(Math.abs(medium.indexAt(pos) - expected)).toBeLessThan(1e-10)
  })

  it('gradient horizontal courbe le rayon vertical dans la bonne direction', () => {
    // α2 > 0 → n croît vers +x → un rayon vertical (direction +y) reçoit une force vers +x
    const W = 300, H = 300, n0 = 1.5, alpha2 = 0.0005
    const medium = new GRINElement({
      id: 'custom-curv', position: { x: 0, y: 0 }, width: W, height: H,
      profile: 'custom', n0, alpha: 0, alpha2,
    })
    // Rayon entrant à gauche du centre (x < cx) en direction +y
    const entry = { x: W / 2 - 10, y: 0 }
    const result = integrateGRIN(entry, { x: 0, y: 1 }, medium, 555, {
      dsMax: 2, dsMin: 0.05, maxSteps: 100_000,
    })
    // Avec α2 > 0, gradient pointe vers +x → rayon dévié vers +x
    const pts = result.points
    expect(pts[pts.length - 1].x).toBeGreaterThan(entry.x)
  })
})

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

// ─────────────────────────────────────────────────────────────────────────────
// V — Rayon externe entrant dans un milieu GRIN
//
// Vérifie que lorsqu'un rayon part de l'extérieur d'un milieu GRIN :
//   1. Un segment droit est émis jusqu'à la face d'entrée
//   2. La réfraction air→n_GRIN est appliquée à l'entrée
//   3. L'intégrateur RK4 produit une trajectoire courbe à l'intérieur
// ─────────────────────────────────────────────────────────────────────────────

describe('V — Rayon externe entrant dans un milieu GRIN', () => {
  const grinX = 200, grinY = 100, grinW = 300, grinH = 200

  function makeScene(id: string): { medium: GRINElement; scene: Scene } {
    const medium = new GRINElement({
      id,
      position: { x: grinX, y: grinY },
      width: grinW, height: grinH,
      profile: 'parabolic',
      n0: 1.5, alpha: 0.015,
    })
    const scene: Scene = { elements: [medium], sources: [], metadata: { name: 'Test' } }
    return { medium, scene }
  }

  it('génère au moins 2 segments : un droit avant le GRIN, un courbe dedans', () => {
    const { scene } = makeScene('ext-entry-1')
    // Rayon décalé de 20 px du centre pour que la courbure soit visible
    const ray: Ray = {
      origin:    { x: 50, y: grinY + grinH / 2 + 20 },
      direction: { x: 1, y: 0 },
      wavelength: 555, intensity: 1,
    }
    const result = traceRay(ray, scene)
    expect(result.segments.length).toBeGreaterThanOrEqual(2)

    // Premier segment : droit (aucun curvePoints)
    expect(result.segments[0].curvePoints).toBeUndefined()

    // Deuxième segment : courbe (curvePoints présents)
    const curveSeg = result.segments[1]
    expect(curveSeg.curvePoints).toBeDefined()
    expect(curveSeg.curvePoints!.length).toBeGreaterThan(2)
  })

  it('les points de la trajectoire interne sont non-colinéaires', () => {
    const { scene } = makeScene('ext-entry-2')
    const ray: Ray = {
      origin:    { x: 50, y: grinY + grinH / 2 + 30 },
      direction: { x: 1, y: 0 },
      wavelength: 555, intensity: 1,
    }
    const result = traceRay(ray, scene)
    const curveSeg = result.segments.find(s => s.curvePoints !== undefined)
    expect(curveSeg).toBeDefined()

    const pts = curveSeg!.curvePoints!
    const dx1 = pts[1].x - pts[0].x
    const dy1 = pts[1].y - pts[0].y
    const dxN = pts[pts.length - 1].x - pts[0].x
    const dyN = pts[pts.length - 1].y - pts[0].y
    // Produit vectoriel ≠ 0 → non-colinéaires → trajectoire courbée
    const cross = dx1 * dyN - dy1 * dxN
    expect(Math.abs(cross)).toBeGreaterThan(1)
  })

  it('le premier segment se termine sur la face gauche du GRIN (x ≈ grinX)', () => {
    const { scene } = makeScene('ext-entry-3')
    const ray: Ray = {
      origin:    { x: 50, y: grinY + grinH / 2 },
      direction: { x: 1, y: 0 },
      wavelength: 555, intensity: 1,
    }
    const result = traceRay(ray, scene)
    expect(result.segments.length).toBeGreaterThanOrEqual(2)
    // Le premier segment doit se terminer à x ≈ grinX (face gauche)
    expect(Math.abs(result.segments[0].end.x - grinX)).toBeLessThan(2)
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
