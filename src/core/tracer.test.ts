import { describe, it, expect } from 'vitest'
import { traceRay, FREE_RAY_LENGTH } from './tracer.ts'
import { FlatMirror } from './elements/flat-mirror.ts'
import { ThinLens } from './elements/thin-lens.ts'
import { Prism } from './elements/prism.ts'
import { Block } from './elements/block.ts'
import type { Ray, Scene } from './types.ts'
import { dot, normalize, sub } from './vector.ts'

const DEG = Math.PI / 180
const EPS_ANGLE = 1e-6
const EPS_POS   = 1e-6

function makeRay(ox: number, oy: number, dx: number, dy: number): Ray {
  return { origin: { x: ox, y: oy }, direction: normalize({ x: dx, y: dy }), wavelength: 550, intensity: 1 }
}

function makeScene(...elements: Scene['elements']): Scene {
  return { elements, sources: [], metadata: { name: 'test' } }
}

/** Direction unitaire extraite du vecteur (end − start) d'un segment. */
function segDir(seg: { start: { x: number; y: number }, end: { x: number; y: number } }) {
  return normalize(sub(seg.end, seg.start))
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Rayon libre (aucune intersection)
// ─────────────────────────────────────────────────────────────────────────────

describe("tracer — rayon libre", () => {
  const scene = makeScene()
  const ray = makeRay(0, 0, 1, 0)
  const result = traceRay(ray, scene)

  it("produit exactement 1 segment", () => {
    expect(result.segments).toHaveLength(1)
  })

  it("segment part de l'origine du rayon", () => {
    expect(result.segments[0].start.x).toBeCloseTo(0, 9)
    expect(result.segments[0].start.y).toBeCloseTo(0, 9)
  })

  it("segment terminal de longueur FREE_RAY_LENGTH", () => {
    const seg = result.segments[0]
    expect(seg.end.x).toBeCloseTo(FREE_RAY_LENGTH, 6)
    expect(seg.end.y).toBeCloseTo(0, 6)
  })

  it("direction du segment = direction du rayon", () => {
    const d = segDir(result.segments[0])
    expect(d.x).toBeCloseTo(1, 9)
    expect(d.y).toBeCloseTo(0, 9)
  })

  it("longueur optique = FREE_RAY_LENGTH (indice 1)", () => {
    expect(result.totalOpticalPath).toBeCloseTo(FREE_RAY_LENGTH, 6)
  })

  it("rayon en direction quelconque : 1 segment terminal", () => {
    const r2 = makeRay(10, -5, 0.6, 0.8)
    const res = traceRay(r2, scene)
    expect(res.segments).toHaveLength(1)
    const d = segDir(res.segments[0])
    expect(d.x).toBeCloseTo(0.6, 6)
    expect(d.y).toBeCloseTo(0.8, 6)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. Miroir plan 45° — réflexion spéculaire
//
// FlatMirror centre (0,0), angle=π/4, longueur=200.
// Rayon horizontal (1,0) depuis (−200, 0).
// Impact en (0,0) → rayon réfléchi (0, 1).
// ─────────────────────────────────────────────────────────────────────────────

describe("tracer — miroir plan 45°", () => {
  const mirror = new FlatMirror({ id: 'm', position: { x: 0, y: 0 }, angle: Math.PI / 4, length: 200 })
  const scene = makeScene(mirror)
  const ray = makeRay(-200, 0, 1, 0)
  const result = traceRay(ray, scene)

  it("produit 2 segments (approche + rayon reflechi libre)", () => {
    expect(result.segments).toHaveLength(2)
  })

  it("segments[0] : de (−200, 0) a (0, 0)", () => {
    const s = result.segments[0]
    expect(s.start.x).toBeCloseTo(-200, 6)
    expect(s.start.y).toBeCloseTo(0, 6)
    expect(s.end.x).toBeCloseTo(0, 6)
    expect(s.end.y).toBeCloseTo(0, 6)
  })

  it("segments[1] part du point d'impact (0, 0)", () => {
    const s = result.segments[1]
    expect(s.start.x).toBeCloseTo(0, 6)
    expect(s.start.y).toBeCloseTo(0, 6)
  })

  it("rayon reflechi direction = (0, 1) — V1", () => {
    const d = segDir(result.segments[1])
    expect(d.x).toBeCloseTo(0, EPS_ANGLE)
    expect(d.y).toBeCloseTo(1, EPS_ANGLE)
  })

  it("angle de reflexion = angle d'incidence (45°)", () => {
    const d_in  = ray.direction
    const d_out = segDir(result.segments[1])
    const n_mirror = normalize({ x: -Math.SQRT1_2, y: Math.SQRT1_2 })
    expect(Math.abs(dot(d_in, n_mirror))).toBeCloseTo(Math.abs(dot(d_out, n_mirror)), 9)
  })

  it("longueur optique = distance parcourue (milieu = air)", () => {
    // Approche : 200 px. Reflechi : FREE_RAY_LENGTH.
    expect(result.totalOpticalPath).toBeCloseTo(200 + FREE_RAY_LENGTH, 3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. V4 — Lentille convergente f=100, rayon parallele h=50
//
// ThinLens centre (0,0), angle=0, f=100, height=200.
// Rayon horizontal depuis (−200, 50).
// Apres deviation : croise l'axe en x=100, y=0.
// ─────────────────────────────────────────────────────────────────────────────

describe("V4 — lentille convergente (tracer integre)", () => {
  const lens = new ThinLens({ id: 'l', position: { x: 0, y: 0 }, angle: 0, focalLength: 100, height: 200 })
  const scene = makeScene(lens)
  const ray = makeRay(-200, 50, 1, 0)
  const result = traceRay(ray, scene)

  it("produit 2 segments (approche + rayon devie libre)", () => {
    expect(result.segments).toHaveLength(2)
  })

  it("segments[0] : de (−200, 50) a (0, 50)", () => {
    const s = result.segments[0]
    expect(s.start.x).toBeCloseTo(-200, 6)
    expect(s.start.y).toBeCloseTo(50, 6)
    expect(s.end.x).toBeCloseTo(0, 6)
    expect(s.end.y).toBeCloseTo(50, 6)
  })

  it("segments[1] part de (0, 50)", () => {
    const s = result.segments[1]
    expect(s.start.x).toBeCloseTo(0, 6)
    expect(s.start.y).toBeCloseTo(50, 6)
  })

  it("rayon devie croise l'axe optique en x = f = 100 (eps = 1e-9) — V4", () => {
    // Parametrique : (0, 50) + t·d ; a y=0 : t = 50/|d.y|, x = t·d.x
    const d = segDir(result.segments[1])
    expect(d.y).toBeLessThan(0)
    const t_cross = 50 / (-d.y)
    const x_cross = 0 + t_cross * d.x
    expect(Math.abs(x_cross - 100)).toBeLessThan(1e-9)
  })

  it("rayon de h=−50 (symetrique) croise aussi en x=100", () => {
    const ray2 = makeRay(-200, -50, 1, 0)
    const res2 = traceRay(ray2, scene)
    const d2 = segDir(res2.segments[1])
    expect(d2.y).toBeGreaterThan(0)
    const t_cross = 50 / d2.y
    const x_cross = 0 + t_cross * d2.x
    expect(Math.abs(x_cross - 100)).toBeLessThan(1e-9)
  })

  it("rayon axial (h=0) : direction inchangee apres lentille", () => {
    const ray0 = makeRay(-200, 0, 1, 0)
    const res0 = traceRay(ray0, scene)
    const d0 = segDir(res0.segments[1])
    expect(d0.x).toBeCloseTo(1, 9)
    expect(Math.abs(d0.y)).toBeLessThan(1e-9)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. V5 — Prisme equilateral 60°, n=1.5, deviation minimale
//
// A la deviation minimale :
//   theta1 = arcsin(n · sin(A/2)) = arcsin(0.75) ≈ 48.59°
//   delta_min = 2·arcsin(0.75) − 60° ≈ 37.18°
//
// Geometrie (angle=0, apex +y) :
//   d_in = cosT1·(√3/2, −1/2) + sinT1·(1/2, √3/2)
//   Dans le verre : direction horizontale (1, 0)
//   Sortie : d_exit = (d_in.x, −d_in.y)  [symetrie]
// ─────────────────────────────────────────────────────────────────────────────

describe("V5 — prisme deviation minimale (tracer integre)", () => {
  const N  = 1.5
  const A  = 60 * DEG
  const delta_min = 2 * Math.asin(N * Math.sin(A / 2)) - A  // ≈ 37.18°

  // Direction incidente a deviation minimale
  // Normale interieure face gauche : (√3/2, −1/2)
  // Tangente face gauche (V1→V0) : (1/2, √3/2)
  const sinT1 = N * Math.sin(A / 2)                   // = 0.75
  const cosT1 = Math.sqrt(1 - sinT1 * sinT1)          // = √7/4
  const d_in = normalize({
    x: cosT1 * (Math.sqrt(3) / 2) + sinT1 * 0.5,
    y: cosT1 * (-0.5)              + sinT1 * (Math.sqrt(3) / 2),
  })

  const prism = new Prism({ id: 'p', position: { x: 0, y: 0 }, angle: 0, size: 200, n: N })
  const scene = makeScene(prism)
  const ray   = makeRay(-300, 0, d_in.x, d_in.y)
  const result = traceRay(ray, scene)

  it("produit 3 segments (approche, verre, sortie libre)", () => {
    expect(result.segments).toHaveLength(3)
  })

  it("segment dans le verre : direction horizontale (dy ≈ 0)", () => {
    // A deviation minimale le rayon est parallele a la base
    const d = segDir(result.segments[1])
    expect(Math.abs(d.y)).toBeLessThan(1e-9)
    expect(d.x).toBeGreaterThan(0)
  })

  it("symetrie : point d'entree et de sortie ont le meme y", () => {
    const y_entry = result.segments[0].end.y
    const y_exit  = result.segments[1].end.y
    expect(Math.abs(y_entry - y_exit)).toBeLessThan(EPS_POS)
  })

  it("deviation totale = delta_min ≈ 37.18° (eps = 1e-6 rad) — V5", () => {
    const d_exit = segDir(result.segments[2])
    const cosD   = dot(d_in, d_exit)
    const delta_actual = Math.acos(Math.min(1, cosD))
    expect(Math.abs(delta_actual - delta_min)).toBeLessThan(EPS_ANGLE)
  })

  it("rayon de sortie : composante x identique a d_in", () => {
    const d_exit = segDir(result.segments[2])
    expect(d_exit.x).toBeCloseTo(d_in.x, 6)
  })

  it("rayon de sortie : composante y opposee a d_in.y (symetrie minimale)", () => {
    const d_exit = segDir(result.segments[2])
    expect(d_exit.y).toBeCloseTo(-d_in.y, 6)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. Bloc refractant — traversee complete + decalage lateral
//
// Block centre (0,0), width=200, height=400, n=1.5, angle=0.
// Rayon depuis (−300, 0) a theta1=30° de la normale (face gauche).
// delta = width · sin(theta1−theta2) / cos(theta2)  avec sin(theta2) = sin(theta1)/n
// ─────────────────────────────────────────────────────────────────────────────

describe("tracer — bloc refractant (traversee + decalage lateral)", () => {
  const N  = 1.5
  const W  = 200
  const theta1 = 30 * DEG
  const theta2 = Math.asin(Math.sin(theta1) / N)
  const delta_expected = W * Math.sin(theta1 - theta2) / Math.cos(theta2)

  const block = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: 0, width: W, height: 400, n: N })
  const scene = makeScene(block)
  const ray   = makeRay(-300, 0, Math.cos(theta1), -Math.sin(theta1))
  const result = traceRay(ray, scene)

  it("produit 3 segments (approche, verre, sortie libre)", () => {
    expect(result.segments).toHaveLength(3)
  })

  it("segments[0] : se termine sur la face gauche (x = −100)", () => {
    expect(result.segments[0].end.x).toBeCloseTo(-100, 6)
  })

  it("segments[1] : traverse le verre de x=−100 a x=+100", () => {
    expect(result.segments[1].start.x).toBeCloseTo(-100, 6)
    expect(result.segments[1].end.x).toBeCloseTo(100, 6)
  })

  it("rayon de sortie parallele au rayon incident", () => {
    const d_exit = segDir(result.segments[2])
    expect(Math.abs(dot(d_exit, ray.direction) - 1)).toBeLessThan(EPS_ANGLE)
  })

  it("decalage lateral = delta analytique (eps = 1e-9)", () => {
    const seg_exit = result.segments[1]
    const exit_x   = seg_exit.end.x
    const t_ext    = (exit_x - ray.origin.x) / ray.direction.x
    const p_ext    = { x: ray.origin.x + t_ext * ray.direction.x,
                       y: ray.origin.y + t_ext * ray.direction.y }
    const dv       = sub(seg_exit.end, p_ext)
    const perp     = { x: -ray.direction.y, y: ray.direction.x }
    const delta_actual = Math.abs(dot(dv, perp))
    expect(Math.abs(delta_actual - delta_expected)).toBeLessThan(1e-9)
  })

  it("chemin optique > distance geometrique (indice > 1 dans le verre)", () => {
    const t_approach = (result.segments[0].end.x - ray.origin.x) / ray.direction.x
    const dist_glass  = W / Math.cos(theta2)
    const opl_expected = t_approach + N * dist_glass + FREE_RAY_LENGTH
    expect(Math.abs(result.totalOpticalPath - opl_expected)).toBeLessThan(1e-3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. Reflexion totale interne dans un bloc
//
// Block centre (0,0), width=200, height=200, n=1.5.
// theta_c = arcsin(1/n) ≈ 41.81°.
//
// Rayon depuis (−200, 90), direction (cos60°, −sin60°) = (0.5, −√3/2).
//
// Physique :
//   • Entree face gauche (theta1=60°) → inside theta2 = arcsin(√3/3) ≈ 35.26°
//   • Frappe face inferieure a ≈ 54.7° > theta_c → TIR
//   • Apres TIR : remonte et sort par la face droite
//   • Sortie : direction (cos60°, +sin60°) [symetrie par rapport a la face basse]
//   => 4 segments : approche · interieur-descente · interieur-montee · sortie libre
// ─────────────────────────────────────────────────────────────────────────────

describe("tracer — reflexion totale interne (bloc n=1.5)", () => {
  const N      = 1.5
  const theta_c = Math.asin(1 / N)    // ≈ 41.81°
  const theta1  = 60 * DEG

  const block = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: 0, width: 200, height: 200, n: N })
  const scene = makeScene(block)
  // Origine choisie pour que l'entree sur la face gauche soit dans [−100, 100]
  // y_entry = 90 − (100/cos60°)·sin60° = 90 − 200·(√3/2) ≈ 90 − 173 = −83 ✓
  const ray   = makeRay(-200, 90, Math.cos(theta1), -Math.sin(theta1))
  const result = traceRay(ray, scene)

  it("angle critique = arcsin(1/n)", () => {
    expect(Math.abs(theta_c - Math.asin(1 / N))).toBeLessThan(EPS_ANGLE)
  })

  it("produit 4 segments (TIR sur face inferieure)", () => {
    expect(result.segments).toHaveLength(4)
  })

  it("segments[0] : se termine sur la face gauche (x ≈ −100)", () => {
    expect(result.segments[0].end.x).toBeCloseTo(-100, 6)
  })

  it("segments[1] : dans le verre, direction vers le bas (dy < 0)", () => {
    const d = segDir(result.segments[1])
    expect(d.y).toBeLessThan(0)
    expect(d.x).toBeGreaterThan(0)
  })

  it("segments[1] se termine sur la face inferieure (y ≈ −100)", () => {
    expect(result.segments[1].end.y).toBeCloseTo(-100, 6)
  })

  it("segments[2] : apres TIR, direction vers le haut (dy > 0)", () => {
    const d = segDir(result.segments[2])
    expect(d.y).toBeGreaterThan(0)
    expect(d.x).toBeGreaterThan(0)
  })

  it("TIR conserve la composante x (reflexion sur face horizontale)", () => {
    const d_before = segDir(result.segments[1])
    const d_after  = segDir(result.segments[2])
    expect(d_after.x).toBeCloseTo(d_before.x, 9)
    expect(d_after.y).toBeCloseTo(-d_before.y, 9)
  })

  it("segments[2] se termine sur la face droite (x ≈ +100)", () => {
    expect(result.segments[2].end.x).toBeCloseTo(100, 6)
  })

  it("rayon de sortie : direction = (cos60°, +sin60°) [symetrie verticale]", () => {
    const d_exit = segDir(result.segments[3])
    expect(d_exit.x).toBeCloseTo(Math.cos(theta1), 6)
    expect(d_exit.y).toBeCloseTo(Math.sin(theta1), 6)
  })

  it("composante x de sortie = composante x incidente", () => {
    const d_exit = segDir(result.segments[3])
    expect(d_exit.x).toBeCloseTo(ray.direction.x, 6)
  })

  it("composante y de sortie = −composante y incidente (rebond bas)", () => {
    const d_exit = segDir(result.segments[3])
    expect(d_exit.y).toBeCloseTo(-ray.direction.y, 6)
  })
})
