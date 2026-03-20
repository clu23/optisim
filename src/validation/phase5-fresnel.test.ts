import { describe, it, expect } from 'vitest'
import { fresnelCoefficients, fresnelReflectance, fresnelTransmittance, brewsterAngle } from '../core/fresnel.ts'
import { traceRay } from '../core/tracer.ts'
import { Block } from '../core/elements/block.ts'
import type { Ray, Scene } from '../core/types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const EPS = 1e-10   // tolérance pour les calculs analytiques exacts
const DEG = Math.PI / 180

function makeRay(ox: number, oy: number, dx: number, dy: number, pol: Ray['polarization'] = 'unpolarized'): Ray {
  const mag = Math.sqrt(dx * dx + dy * dy)
  return { origin: { x: ox, y: oy }, direction: { x: dx / mag, y: dy / mag }, wavelength: 555, intensity: 1, polarization: pol }
}

// ─────────────────────────────────────────────────────────────────────────────
// V10 — Incidence normale air → verre n=1.5
//
// Formule : R = ((n1−n2)/(n1+n2))² = (0.5/2.5)² = 0.04 = 4%
// Symétrie : Rs = Rp à θ=0° (cos θ = 1, les deux formules coïncident)
// ─────────────────────────────────────────────────────────────────────────────

describe('V10 — Fresnel incidence normale (θ=0°)', () => {
  const n1 = 1.0, n2 = 1.5
  const cosI = 1   // θ = 0° → cos θ = 1

  it('Rs = 4% à θ=0°', () => {
    const f = fresnelCoefficients(n1, n2, cosI)
    expect(Math.abs(f.Rs - 0.04)).toBeLessThan(EPS)
  })

  it('Rp = 4% à θ=0° (symétrie s/p à incidence normale)', () => {
    const f = fresnelCoefficients(n1, n2, cosI)
    expect(Math.abs(f.Rp - 0.04)).toBeLessThan(EPS)
  })

  it('R non polarisé = 4%', () => {
    const R = fresnelReflectance(n1, n2, cosI, 'unpolarized')
    expect(Math.abs(R - 0.04)).toBeLessThan(EPS)
  })

  it('T = 1 − R = 96% (conservation d\'énergie)', () => {
    const f = fresnelCoefficients(n1, n2, cosI)
    expect(Math.abs(f.Ts + f.Rs - 1)).toBeLessThan(EPS)
    expect(Math.abs(f.Tp + f.Rp - 1)).toBeLessThan(EPS)
    expect(Math.abs(f.Tunpol + f.Runpol - 1)).toBeLessThan(EPS)
  })

  it('T non polarisé = 96%', () => {
    const T = fresnelTransmittance(n1, n2, cosI, 'unpolarized')
    expect(Math.abs(T - 0.96)).toBeLessThan(EPS)
  })

  it('symétrie inverse n2→n1 : même R', () => {
    // R est le même quel que soit le sens (air→verre = verre→air si θ < θ_c)
    const R12 = fresnelReflectance(n1, n2, cosI)
    const R21 = fresnelReflectance(n2, n1, cosI)
    expect(Math.abs(R12 - R21)).toBeLessThan(EPS)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// V8 — Angle de Brewster air → verre n=1.5
//
// θ_B = arctan(n2/n1) = arctan(1.5) ≈ 56.31°
// À cet angle : Rp = 0 exactement (la polarisation p passe intégralement)
//               Rs > 0 (environ 14.8%)
// ─────────────────────────────────────────────────────────────────────────────

describe('V8 — Angle de Brewster (n1=1, n2=1.5)', () => {
  const n1 = 1.0, n2 = 1.5
  const thetaB = brewsterAngle(n1, n2)   // arctan(1.5)
  const cosB   = Math.cos(thetaB)

  it('θ_B = arctan(n2/n1) ≈ 56.31°', () => {
    const expected = Math.atan(n2 / n1)
    expect(Math.abs(thetaB - expected)).toBeLessThan(EPS)
    expect(thetaB * (180 / Math.PI)).toBeCloseTo(56.31, 1)
  })

  it('Rp = 0 à l\'angle de Brewster (précision < 1e-10)', () => {
    const f = fresnelCoefficients(n1, n2, cosB)
    expect(f.Rp).toBeLessThan(EPS)
  })

  it('Rs > 0 à l\'angle de Brewster (réflexion partielle s)', () => {
    const f = fresnelCoefficients(n1, n2, cosB)
    expect(f.Rs).toBeGreaterThan(0.1)   // Rs ≈ 14.8%
  })

  it('Rs ≈ 14.8% à l\'angle de Brewster (formule analytique)', () => {
    // rs = (cosB − n2·cosT) / (cosB + n2·cosT)
    // À θ_B : sinT = sinB/n2 = (n2/√(n1²+n2²)) / n2 = n1/√(n1²+n2²)
    //         cosT = n2/√(n1²+n2²)
    const f = fresnelCoefficients(n1, n2, cosB)
    expect(f.Rs).toBeCloseTo(0.1481, 3)
  })

  it('Tp = 1 à l\'angle de Brewster (conservation d\'énergie)', () => {
    const f = fresnelCoefficients(n1, n2, cosB)
    expect(Math.abs(f.Tp - 1)).toBeLessThan(EPS)
  })

  it('R non polarisé = Rs/2 ≈ 7.4% à θ_B', () => {
    const f = fresnelCoefficients(n1, n2, cosB)
    expect(Math.abs(f.Runpol - f.Rs / 2)).toBeLessThan(EPS)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests additionnels sur les propriétés générales de Fresnel
// ─────────────────────────────────────────────────────────────────────────────

describe('Fresnel — propriétés générales', () => {
  it('R → 1 à θ → 90° (incidence rasante)', () => {
    // cos θ → 0 → R_s, R_p → 1
    const f = fresnelCoefficients(1, 1.5, 0.001)
    expect(f.Rs).toBeGreaterThan(0.99)
    expect(f.Rp).toBeGreaterThan(0.99)
  })

  it('TIR : Rs = Rp = 1 si sin²T > 1', () => {
    // verre→air, θ > θ_c = arcsin(1/1.5) ≈ 41.8°
    // On prend θ = 50° → cosI = cos(50°) ≈ 0.6428
    const cosI = Math.cos(50 * DEG)
    const f = fresnelCoefficients(1.5, 1, cosI)
    expect(f.Rs).toBeCloseTo(1, 10)
    expect(f.Rp).toBeCloseTo(1, 10)
    expect(f.Ts).toBeCloseTo(0, 10)
    expect(f.Tp).toBeCloseTo(0, 10)
  })

  it('R et T selon la polarisation s', () => {
    const Rs = fresnelReflectance(1, 1.5, Math.cos(45 * DEG), 's')
    const Ts = fresnelTransmittance(1, 1.5, Math.cos(45 * DEG), 's')
    expect(Math.abs(Rs + Ts - 1)).toBeLessThan(EPS)
  })

  it('R et T selon la polarisation p', () => {
    const Rp = fresnelReflectance(1, 1.5, Math.cos(30 * DEG), 'p')
    const Tp = fresnelTransmittance(1, 1.5, Math.cos(30 * DEG), 'p')
    expect(Math.abs(Rp + Tp - 1)).toBeLessThan(EPS)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tests d'intégration dans le traceur
// ─────────────────────────────────────────────────────────────────────────────

describe('Traceur — propagation d\'intensité par Fresnel', () => {
  // Bloc de verre n=1.5, centré en (300, 200), 60×200 px
  function makeBlockScene(): Scene {
    const block = new Block({ id: 'b', position: { x: 270, y: 100 }, angle: 0, width: 60, height: 200, n: 1.5 })
    return { elements: [block], sources: [], metadata: { name: 'test' } }
  }

  it('intensité du rayon transmis < 1 après traversée d\'un bloc (Fresnel)', () => {
    const scene = makeBlockScene()
    // Rayon horizontal traversant le bloc de part en part
    const ray = makeRay(0, 200, 1, 0)
    const result = traceRay(ray, scene, 0)   // splitDepth=0 : pas de split

    // Le segment final (après traversée) doit avoir une intensité < 1
    // (deux interfaces, chacune transmet T = 1 - R ≈ 0.96)
    const lastSeg = result.segments[result.segments.length - 1]
    expect(lastSeg.intensity).toBeLessThan(1)
    // T² ≈ 0.96² ≈ 0.922 — tolerance large car on vérifie juste que c'est < 1
    expect(lastSeg.intensity).toBeGreaterThan(0.85)
  })

  it('ray splitting : un rayon réfléchi est émis à la première interface', () => {
    const scene = makeBlockScene()
    const ray = makeRay(0, 200, 1, 0)
    const result = traceRay(ray, scene, 1)   // splitDepth=1 → reflets activés

    // Il doit y avoir plus de segments qu'avec splitDepth=0 (à cause des reflets)
    const noSplitResult = traceRay(ray, scene, 0)
    expect(result.segments.length).toBeGreaterThan(noSplitResult.segments.length)
  })

  it('intensité rayon réfléchi ≈ R ≈ 4% à incidence normale', () => {
    const scene = makeBlockScene()
    // Rayon horizontal → incidence normale sur la face gauche du bloc (x=270)
    const ray = makeRay(0, 200, 1, 0, 'unpolarized')
    const result = traceRay(ray, scene, 1)

    // Le premier segment va de l'origine à la face du bloc (intensité 1)
    // Le second segment est le rayon réfléchi (intensité ≈ R = 4%)
    // On cherche le segment dont l'intensité est la plus proche de 0.04
    const reflectedSegs = result.segments.filter(s => Math.abs(s.intensity - 0.04) < 0.02)
    expect(reflectedSegs.length).toBeGreaterThan(0)
    expect(Math.abs(reflectedSegs[0].intensity - 0.04)).toBeLessThan(0.01)
  })

  it('polarisation p à θ_B : rayon réfléchi d\'intensité ≈ 0 (Rp=0)', () => {
    // θ_B = 56.31° pour n=1.5 → on tire à 56.31° sur la face gauche du bloc
    const scene = makeBlockScene()
    const thetaB = Math.atan(1.5)   // ≈ 56.31°
    // Rayon à 56.31° d'incidence sur la face gauche (normale +x)
    // direction du rayon : angle tel que l'angle avec +x soit θ_B → (cos θ_B, sin θ_B)
    const ray = makeRay(0, 200, Math.cos(thetaB), Math.sin(thetaB), 'p')
    const result = traceRay(ray, scene, 1)

    // Avec polarisation p à θ_B, Rp = 0 → pas de rayon réfléchi significatif
    // L'intensité totale du premier segment réfléchi doit être ~0 ou absent
    const noSplitResult = traceRay(ray, scene, 0)
    // splitDepth=1 ne devrait pas générer plus de segments (Rp*I < MIN_SPLIT_INTENSITY)
    expect(result.segments.length).toBe(noSplitResult.segments.length)
  })
})
