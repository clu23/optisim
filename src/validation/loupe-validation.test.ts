/**
 * Validation physique — Loupe 5× (N-BK7 biconvexe f≈50mm)
 *
 * Setup : ThickLens biconvexe symétrique N-BK7
 *   R1 = R2 = 51.7mm (conv. ThickLens : R2_TL = +51.7 ↔ R2_std = −51.7mm)
 *   épaisseur = 4mm, demi-ouverture = 12.5mm
 *   Lentille centrée en x=0 : V1=−2mm, V2=+2mm
 *
 * L1  BFD paraxiale (h→0) ≈ 49.3mm (±0.5mm)
 * L2  Conjugaison : objet à 200mm avant V1 → image à v théorique ±1mm
 * L3  Grandissement : m ≈ −v/u (±5%)
 * L4  Objet au foyer objet : rayons sortants parallèles (divergence < 0.1°)
 * L5  Aberration sphérique : RMS(h=12.5mm) > RMS(h=5mm)
 * L6  LCA : foyer bleu (486nm) plus court que foyer rouge (656nm), Δ > 0.3mm
 */

import { describe, it, expect } from 'vitest'
import { ThickLens }       from '../core/elements/thick-lens.ts'
import { ImagePlane }      from '../core/elements/image-plane.ts'
import { computeLCA }      from '../core/ray-fan.ts'
import { collectSpots }    from '../core/spot-diagram.ts'
import { traceRay }        from '../core/tracer.ts'
import { computeImage }    from '../core/image-calculator.ts'
import { LAMBDA_D, LAMBDA_F, LAMBDA_C } from '../core/glass-catalog.ts'
import type { Ray, Scene, TraceResult } from '../core/types.ts'

// ─── Setup ────────────────────────────────────────────────────────────────────

const R    = 51.7   // mm — rayon biconvexe symétrique (R1_TL = R2_TL)
const T    = 4      // mm — épaisseur au centre
const HALF = 12.5   // mm — demi-ouverture (φ25mm)
const DEG  = Math.PI / 180

const lens = new ThickLens({
  id: 'loupe', label: 'N-BK7 biconvexe',
  position: { x: 0, y: 0 }, angle: 0,
  R1: R, R2: R, kappa1: 0, kappa2: 0,
  thickness: T, halfHeight: HALF,
  n: 1.5168, glassId: 'N-BK7',
})

const V1x = lens.vertex1().x   // = −2mm
const V2x = lens.vertex2().x   // = +2mm

const scene: Scene = { elements: [lens], sources: [], metadata: { name: 'loupe-validation' } }

const PUPIL_X = -200  // plan pupille fictif (mm)

// Plans principaux, foyers, focale — calculés une fois pour toutes
const fd = lens.focalData(LAMBDA_D)!
//   fd.F   = foyer objet (avant la lentille)
//   fd.Fp  = foyer image (derrière la lentille)
//   fd.H   = plan principal avant
//   fd.Hp  = plan principal arrière
//   fd.f   = focale effective (EFL)

// BFD paraxiale via computeLCA (pupilRadius très petit → quasi-paraxial)
const paraxPts = computeLCA(scene, {
  pupilX: PUPIL_X, pupilRadius: 0.1,
  rayDir: { x: 1, y: 0 },
  wavelengths: [LAMBDA_D],
})
const focParaxD = paraxPts[0]!.focusX  // x du foyer paraxial λ=587nm

// ─── L1 : BFD paraxiale ≈ 49.3mm (±0.5mm) ────────────────────────────────────

describe('L1 — BFD paraxiale ≈ 49.3mm (±0.5mm)', () => {
  const bfd = focParaxD - V2x

  it('BFD ∈ [48.8, 49.8] mm', () => {
    expect(bfd).toBeGreaterThan(48.8)
    expect(bfd).toBeLessThan(49.8)
  })

  it('BFD cohérente avec focalData() à ±0.3mm', () => {
    // focalData() calcule F' = V2 + BFD via la formule matricielle paraxiale
    const bfdMatrice = fd.Fp.x - V2x
    expect(Math.abs(bfd - bfdMatrice)).toBeLessThan(0.3)
  })
})

// ─── L2 : Conjugaison — objet à 200mm avant V1 ───────────────────────────────
//
// Formule gaussienne (plan H → H') :
//   u_H = objectX − H.x   (négatif pour objet réel à gauche de H)
//   v_Hp = 1 / (1/f + 1/u_H)
//   imageX = H'.x + v_Hp
// ─────────────────────────────────────────────────────────────────────────────

describe("L2 — Conjugaison : image à ±1mm de la valeur théorique", () => {
  const objX = V1x - 200         // 200mm avant V1 → x = −202mm

  const imgResult = computeImage(scene, objX, 1, LAMBDA_D)  // objectY=1 (paraxial)

  // Valeur théorique via plans principaux
  const u_H       = objX - fd.H.x                      // < 0 (objet à gauche de H)
  const v_Hp      = 1 / (1 / fd.f + 1 / u_H)          // > 0 (image réelle à droite)
  const expectedX = fd.Hp.x + v_Hp

  it('image réelle trouvée', () => {
    expect(imgResult.imageX).not.toBeNull()
    expect(imgResult.isReal).toBe(true)
  })

  it('position image à ±1mm du calcul gaussien', () => {
    expect(Math.abs(imgResult.imageX! - expectedX)).toBeLessThan(1)
  })
})

// ─── L3 : Grandissement ≈ −v/u (±5%) ─────────────────────────────────────────
//
// m = v_Hp / u_H (signé — négatif pour image réelle inversée)
// ─────────────────────────────────────────────────────────────────────────────

describe('L3 — Grandissement ≈ −v/u (±5%)', () => {
  const objX = V1x - 200    // −202mm
  const objY = 1            // hauteur objet (paraxial, mm) — petit pour rester près de l'axe

  const imgResult = computeImage(scene, objX, objY, LAMBDA_D, 0.001)

  const u_H  = objX - fd.H.x
  const v_Hp = 1 / (1 / fd.f + 1 / u_H)
  const mTheo = v_Hp / u_H   // négatif (image inversée)

  it('grandissement non nul et négatif (image inversée)', () => {
    expect(imgResult.magnification).not.toBeNull()
    expect(imgResult.magnification!).toBeLessThan(0)
  })

  it('|m − m_théo| / |m_théo| < 5%', () => {
    const m   = imgResult.magnification!
    const err = Math.abs(m - mTheo) / Math.abs(mTheo)
    expect(err).toBeLessThan(0.05)
  })
})

// ─── L4 : Objet au foyer objet — rayons sortants parallèles ──────────────────
//
// Un rayon partant du foyer objet F, quelle que soit son inclinaison,
// doit sortir parallèle à l'axe (propriété du foyer objet).
// On trace des rayons depuis F = fd.F.x à plusieurs angles
// et on vérifie que la pente de sortie est < tan(0.1°).
// ─────────────────────────────────────────────────────────────────────────────

describe('L4 — Objet au foyer : rayons sortants parallèles (divergence < 0.1°)', () => {
  const Fx = fd.F.x   // foyer objet = V1x − FFD ≈ −51.35mm

  // Angles choisis pour que le rayon atteigne la lentille à h < 10mm (paraxial–modéré)
  //   h ≈ (V1x − Fx) × tan(α) = 49.35 × tan(α)
  //   α=10° → h ≈ 8.7mm < 12.5mm ✓
  const testAngles = [1, 2, 3, 4]  // degrés — régime paraxial (h < 3.5mm)

  for (const angleDeg of testAngles) {
    it(`rayon à ${angleDeg}° depuis F : pente de sortie < tan(0.1°)`, () => {
      const a   = angleDeg * DEG
      const ray: Ray = {
        origin:    { x: Fx, y: 0 },
        direction: { x: Math.cos(a), y: Math.sin(a) },
        wavelength: LAMBDA_D,
        intensity:  1,
      }
      const result = traceRay(ray, scene)
      const segs   = result.segments
      expect(segs.length).toBeGreaterThanOrEqual(1)

      // Dernier segment après la lentille (se propage vers +x)
      const last = segs[segs.length - 1]
      const dx   = last.end.x - last.start.x
      const dy   = last.end.y - last.start.y
      expect(dx).toBeGreaterThan(0)   // segment va vers la droite

      const slope = Math.abs(dy / dx)
      expect(slope).toBeLessThan(Math.tan(0.1 * DEG))
    })
  }
})

// ─── L5 : Aberration sphérique : RMS(pleine) > RMS(réduite) ──────────────────

describe('L5 — Aberration sphérique : RMS(h=12.5mm) > RMS(h=5mm)', () => {
  function rmsAtAperture(halfAp: number): number {
    const nRays  = 9
    const heights = Array.from({ length: nRays }, (_, i) =>
      -halfAp + (2 * halfAp * i) / (nRays - 1),
    )
    const plane = new ImagePlane({
      id: 'ip', position: { x: focParaxD, y: 0 }, angle: 0, height: 1,
    })
    const results: TraceResult[] = heights.map(hy => {
      const ray: Ray = {
        origin:    { x: PUPIL_X, y: hy },
        direction: { x: 1, y: 0 },
        wavelength: LAMBDA_D,
        intensity:  1,
      }
      return traceRay(ray, scene)
    })
    return collectSpots(plane, results).rmsRadius
  }

  const rmsFull    = rmsAtAperture(HALF)   // h = ±12.5mm
  const rmsReduced = rmsAtAperture(5)      // h = ±5mm

  it('RMS pleine ouverture > RMS ouverture réduite', () => {
    expect(rmsFull).toBeGreaterThan(rmsReduced)
  })

  it('rapport RMS > 2 (aberration sphérique significative à f/4)', () => {
    // Pour un doublet sphérique f/4, SA3 ∝ h³ → ratio ≈ (12.5/5)³ / ... > 2
    expect(rmsFull / rmsReduced).toBeGreaterThan(2)
  })
})

// ─── L6 : LCA — foyer bleu < foyer rouge, Δ > 0.3mm ─────────────────────────
//
// N-BK7 est un verre à faible dispersion (ν≈64) mais non achromatisé.
// Le foyer bleu (486nm) est plus court que le foyer rouge (656nm) :
// la lentille convergente est plus puissante à haute fréquence.
// ─────────────────────────────────────────────────────────────────────────────

describe('L6 — LCA : focusF(486nm) < focusC(656nm), Δ > 0.3mm', () => {
  const chromaPts = computeLCA(scene, {
    pupilX: PUPIL_X, pupilRadius: 0.5,   // quasi-paraxial
    rayDir: { x: 1, y: 0 },
    wavelengths: [LAMBDA_F, LAMBDA_C],   // 486nm et 656nm
  })

  const focBlue = chromaPts.find(p => Math.abs(p.wavelength - LAMBDA_F) < 1)?.focusX
  const focRed  = chromaPts.find(p => Math.abs(p.wavelength - LAMBDA_C) < 1)?.focusX

  it('foyers F et C trouvés', () => {
    expect(focBlue).toBeDefined()
    expect(focRed).toBeDefined()
    expect(isFinite(focBlue!)).toBe(true)
    expect(isFinite(focRed!)).toBe(true)
  })

  it('foyer bleu (486nm) plus proche de la lentille que le foyer rouge (656nm)', () => {
    expect(focBlue!).toBeLessThan(focRed!)
  })

  it('LCA (Δfocus F−C) > 0.3mm', () => {
    const lca = Math.abs(focRed! - focBlue!)
    expect(lca).toBeGreaterThan(0.3)
  })
})
