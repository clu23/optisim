import { describe, it, expect } from 'vitest'
import { Block } from './block.ts'
import { refract, incidenceAngle } from '../optics.ts'
import type { Ray } from '../types.ts'
import { dot, length, normalize, sub } from '../vector.ts'

const DEG = Math.PI / 180
const EPS_VEC = 1e-9      // Tolérance vecteur unitaire
const EPS_ANGLE = 1e-6    // Tolérance angle (radians)

function makeRay(ox: number, oy: number, dx: number, dy: number): Ray {
  return {
    origin: { x: ox, y: oy },
    direction: normalize({ x: dx, y: dy }),
    wavelength: 550,
    intensity: 1,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Structure
// ─────────────────────────────────────────────────────────────────────────────

describe('Block — structure', () => {
  const b = new Block({ id: 'b1', position: { x: 0, y: 0 }, angle: 0, width: 200, height: 100, n: 1.5 })

  it('type = block', () => {
    expect(b.type).toBe('block')
  })

  it('getSurfaces retourne 4 surfaces', () => {
    expect(b.getSurfaces()).toHaveLength(4)
  })

  it('surface ids : b1-s0 … b1-s3', () => {
    expect(b.getSurfaces().map(s => s.id)).toEqual(['b1-s0', 'b1-s1', 'b1-s2', 'b1-s3'])
  })

  it('getRefractiveIndex retourne n pour toutes les surfaces', () => {
    b.getSurfaces().forEach(s => expect(s.getRefractiveIndex(550)).toBe(1.5))
  })

  it('label par défaut = Bloc', () => {
    expect(b.label).toBe('Bloc')
  })

  it('label personnalisable', () => {
    const b2 = new Block({ id: 'b2', position: { x: 0, y: 0 }, angle: 0, width: 100, height: 100, n: 1.5, label: 'Verre' })
    expect(b2.label).toBe('Verre')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Géométrie
// ─────────────────────────────────────────────────────────────────────────────

describe('Block — géométrie (angle=0, width=200, height=100)', () => {
  const b = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: 0, width: 200, height: 100, n: 1.5 })

  it('BL = (−100, −50)', () => {
    const [bl] = b.vertices()
    expect(bl.x).toBeCloseTo(-100, 9)
    expect(bl.y).toBeCloseTo(-50, 9)
  })

  it('BR = (+100, −50)', () => {
    const [, br] = b.vertices()
    expect(br.x).toBeCloseTo(100, 9)
    expect(br.y).toBeCloseTo(-50, 9)
  })

  it('TR = (+100, +50)', () => {
    const [, , tr] = b.vertices()
    expect(tr.x).toBeCloseTo(100, 9)
    expect(tr.y).toBeCloseTo(50, 9)
  })

  it('TL = (−100, +50)', () => {
    const [, , , tl] = b.vertices()
    expect(tl.x).toBeCloseTo(-100, 9)
    expect(tl.y).toBeCloseTo(50, 9)
  })

  it('largeur BL→BR = 200', () => {
    const [bl, br] = b.vertices()
    expect(br.x - bl.x).toBeCloseTo(200, 9)
  })

  it('hauteur BL→TL = 100', () => {
    const [bl, , , tl] = b.vertices()
    expect(tl.y - bl.y).toBeCloseTo(100, 9)
  })
})

describe('Block — géométrie (angle=π/2)', () => {
  // Rotation 90° CCW : local BL=(−100,−50) → world (50,−100)
  // rotate((−100,−50), π/2) : x' = -(-100)*sin(π/2) + ... = cos(π/2)*(-100) - sin(π/2)*(-50) = 0 + 50 = 50
  //                           y' = sin(π/2)*(-100) + cos(π/2)*(-50) = -100 + 0 = -100
  const b = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: Math.PI / 2, width: 200, height: 100, n: 1.5 })

  it('BL world = (+50, −100) après rotation 90° CCW', () => {
    const [bl] = b.vertices()
    expect(bl.x).toBeCloseTo(50, 6)
    expect(bl.y).toBeCloseTo(-100, 6)
  })

  it('position déplacée respectée', () => {
    const b2 = new Block({ id: 'b', position: { x: 10, y: 20 }, angle: 0, width: 200, height: 100, n: 1.5 })
    const [bl] = b2.vertices()
    expect(bl.x).toBeCloseTo(-90, 9)
    expect(bl.y).toBeCloseTo(-30, 9)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Bounding box
// ─────────────────────────────────────────────────────────────────────────────

describe('Block — getBoundingBox', () => {
  const b = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: 0, width: 200, height: 100, n: 1.5 })

  it('englobe tous les sommets', () => {
    const bb = b.getBoundingBox()
    b.vertices().forEach(v => {
      expect(v.x).toBeGreaterThanOrEqual(bb.min.x)
      expect(v.x).toBeLessThanOrEqual(bb.max.x)
      expect(v.y).toBeGreaterThanOrEqual(bb.min.y)
      expect(v.y).toBeLessThanOrEqual(bb.max.y)
    })
  })

  it('marge strictement positive au-delà des sommets', () => {
    const bb = b.getBoundingBox()
    const [, , tr] = b.vertices()
    expect(bb.max.x).toBeGreaterThan(tr.x)
    expect(bb.max.y).toBeGreaterThan(tr.y)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// containsPoint
// ─────────────────────────────────────────────────────────────────────────────

describe('Block — containsPoint', () => {
  const b = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: 0, width: 200, height: 100, n: 1.5 })

  it('centre (0,0) intérieur', () => {
    expect(b.containsPoint({ x: 0, y: 0 })).toBe(true)
  })

  it('point intérieur (50, 20)', () => {
    expect(b.containsPoint({ x: 50, y: 20 })).toBe(true)
  })

  it('point extérieur à droite (200, 0)', () => {
    expect(b.containsPoint({ x: 200, y: 0 })).toBe(false)
  })

  it('point extérieur au-dessus (0, 100)', () => {
    expect(b.containsPoint({ x: 0, y: 100 })).toBe(false)
  })

  it('point extérieur en-dessous (0, −100)', () => {
    expect(b.containsPoint({ x: 0, y: -100 })).toBe(false)
  })

  it('point extérieur à gauche (−200, 0)', () => {
    expect(b.containsPoint({ x: -200, y: 0 })).toBe(false)
  })

  it('containsPoint fonctionne après rotation 45°', () => {
    const br = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: Math.PI / 4, width: 200, height: 100, n: 1.5 })
    // Centre toujours intérieur
    expect(br.containsPoint({ x: 0, y: 0 })).toBe(true)
    // Point au-delà du sommet le plus à droite (BR rotated ≈ (106, 35)) est extérieur
    expect(br.containsPoint({ x: 150, y: 0 })).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Intersection
// ─────────────────────────────────────────────────────────────────────────────

describe('Block — intersection (angle=0, width=200, height=100)', () => {
  const b = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: 0, width: 200, height: 100, n: 1.5 })
  const s3 = b.getSurfaces()[3]  // face gauche TL→BL, x = −100

  it('rayon horizontal depuis la gauche touche la face gauche', () => {
    expect(s3.intersect(makeRay(-200, 0, 1, 0))).not.toBeNull()
  })

  it('point de contact sur la face gauche : x = −100, y = 0', () => {
    const hit = s3.intersect(makeRay(-200, 0, 1, 0))!
    expect(hit.point.x).toBeCloseTo(-100, 6)
    expect(hit.point.y).toBeCloseTo(0, 6)
  })

  it('t > 0', () => {
    const hit = s3.intersect(makeRay(-200, 0, 1, 0))!
    expect(hit.t).toBeGreaterThan(0)
  })

  it('surfaceId = b-s3', () => {
    const hit = s3.intersect(makeRay(-200, 0, 1, 0))!
    expect(hit.surfaceId).toBe('b-s3')
  })

  it('normale orientée vers le rayon incident (dot < 0)', () => {
    const ray = makeRay(-200, 0, 1, 0)
    const hit = s3.intersect(ray)!
    expect(dot(ray.direction, hit.normal)).toBeLessThan(0)
  })

  it('rayon manque la face gauche si y hors hauteur (|y| > 50)', () => {
    expect(s3.intersect(makeRay(-200, 100, 1, 0))).toBeNull()
  })

  it('rayon depuis la droite (direction +x) ne touche pas la face gauche', () => {
    // Part de x=200 vers la droite → s'éloigne de la face gauche
    expect(s3.intersect(makeRay(200, 0, 1, 0))).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Réfraction à l'entrée — air → verre
// ─────────────────────────────────────────────────────────────────────────────

describe('Block — réfraction entrée air→verre (θ₁=30°, n=1.5)', () => {
  // θ₂ = arcsin(sin 30° / 1.5) = arcsin(1/3) ≈ 19.47°
  const N = 1.5
  const theta1 = 30 * DEG
  // Bloc suffisamment haut pour ne pas clipper
  const b = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: 0, width: 200, height: 400, n: N })
  const s3 = b.getSurfaces()[3]  // face gauche

  it('rayon incident à 30° atteint la face gauche', () => {
    const ray = makeRay(-300, 0, Math.cos(theta1), -Math.sin(theta1))
    expect(s3.intersect(ray)).not.toBeNull()
  })

  it('angle réfracté = arcsin(sin θ₁ / n) [Snell-Descartes]', () => {
    const ray = makeRay(-300, 0, Math.cos(theta1), -Math.sin(theta1))
    const hit = s3.intersect(ray)!
    const refracted = refract(ray.direction, hit.normal, 1, N)
    expect(refracted).not.toBeNull()
    const theta2_expected = Math.asin(Math.sin(theta1) / N)
    const theta2_actual = incidenceAngle(refracted!, hit.normal)
    expect(Math.abs(theta2_actual - theta2_expected)).toBeLessThan(EPS_ANGLE)
  })

  it('direction réfractée unitaire', () => {
    const ray = makeRay(-300, 0, Math.cos(theta1), -Math.sin(theta1))
    const hit = s3.intersect(ray)!
    const refracted = refract(ray.direction, hit.normal, 1, N)!
    expect(Math.abs(length(refracted) - 1)).toBeLessThan(EPS_VEC)
  })

  it('rayon réfracté se dirige vers la droite (x > 0)', () => {
    const ray = makeRay(-300, 0, Math.cos(theta1), -Math.sin(theta1))
    const hit = s3.intersect(ray)!
    const refracted = refract(ray.direction, hit.normal, 1, N)!
    expect(refracted.x).toBeGreaterThan(0)
  })

  it('réfraction à incidence normale (θ₁=0) : pas de déviation', () => {
    const ray = makeRay(-300, 0, 1, 0)
    const hit = s3.intersect(ray)!
    const refracted = refract(ray.direction, hit.normal, 1, N)!
    // Direction inchangée car θ₁=0 → θ₂=0
    expect(Math.abs(refracted.x - 1)).toBeLessThan(EPS_VEC)
    expect(Math.abs(refracted.y)).toBeLessThan(EPS_VEC)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Réfraction à la sortie — verre → air
// ─────────────────────────────────────────────────────────────────────────────

describe('Block — réfraction sortie verre→air (θ₂=arcsin(1/3), n=1.5)', () => {
  // Loi de Snell inverse : θ_sortie = θ₁ = 30°
  const N = 1.5
  const theta1 = 30 * DEG
  const theta2 = Math.asin(Math.sin(theta1) / N)  // arcsin(1/3)
  const b = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: 0, width: 200, height: 200, n: N })
  const s1 = b.getSurfaces()[1]  // face droite BR→TR, x = +100

  it('rayon interne à θ₂ atteint la face droite', () => {
    expect(s1.intersect(makeRay(0, 0, Math.cos(theta2), -Math.sin(theta2)))).not.toBeNull()
  })

  it('angle de sortie = θ₁ = 30° (Snell inverse)', () => {
    const ray = makeRay(0, 0, Math.cos(theta2), -Math.sin(theta2))
    const hit = s1.intersect(ray)!
    const refracted = refract(ray.direction, hit.normal, N, 1)
    expect(refracted).not.toBeNull()
    const theta_exit = incidenceAngle(refracted!, hit.normal)
    expect(Math.abs(theta_exit - theta1)).toBeLessThan(EPS_ANGLE)
  })

  it("rayon de sortie parallèle au rayon incident d'origine", () => {
    const ray = makeRay(0, 0, Math.cos(theta2), -Math.sin(theta2))
    const hit = s1.intersect(ray)!
    const refracted = refract(ray.direction, hit.normal, N, 1)!
    // Le rayon incident original avait direction (cos θ₁, −sin θ₁)
    const d_original = normalize({ x: Math.cos(theta1), y: -Math.sin(theta1) })
    expect(Math.abs(dot(refracted, d_original) - 1)).toBeLessThan(EPS_ANGLE)
  })

  it('réfraction à incidence normale (θ=0) : direction inchangée', () => {
    const ray = makeRay(0, 0, 1, 0)
    const hit = s1.intersect(ray)!
    const refracted = refract(ray.direction, hit.normal, N, 1)!
    expect(Math.abs(refracted.x - 1)).toBeLessThan(EPS_VEC)
    expect(Math.abs(refracted.y)).toBeLessThan(EPS_VEC)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// V_block — Décalage latéral analytique
//
// Pour un bloc plan-parallèle d'épaisseur d traversé sous incidence θ₁ :
//   δ = d · sin(θ₁ − θ₂) / cos(θ₂)   avec sin θ₂ = sin θ₁ / n
//
// Ici : d = 200, θ₁ = 30°, n = 1.5
//   sin θ₂ = 1/3,  cos θ₂ = 2√2/3
//   δ = 200 · sin(30° − arcsin(1/3)) / (2√2/3)
// ─────────────────────────────────────────────────────────────────────────────

describe('V_block — décalage latéral (d=200, n=1.5, θ₁=30°)', () => {
  const N = 1.5
  const W = 200
  const theta1 = 30 * DEG
  const theta2 = Math.asin(Math.sin(theta1) / N)
  const delta_expected = W * Math.sin(theta1 - theta2) / Math.cos(theta2)

  // Bloc suffisamment haut pour éviter tout clipping
  // Entrée à y ≈ −115, sortie à y ≈ −186 → height=400 (±200) suffit
  const b = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: 0, width: W, height: 400, n: N })
  const s3 = b.getSurfaces()[3]  // face gauche (entrée)
  const s1 = b.getSurfaces()[1]  // face droite (sortie)
  const ray_in = makeRay(-300, 0, Math.cos(theta1), -Math.sin(theta1))

  it('δ analytique > 0', () => {
    expect(delta_expected).toBeGreaterThan(0)
  })

  it('décalage latéral mesuré = δ analytique (ε = 1e-9)', () => {
    // 1. Entrée dans le bloc
    const hit_entry = s3.intersect(ray_in)!
    expect(hit_entry).not.toBeNull()

    // 2. Réfraction air → verre
    const d_glass = refract(ray_in.direction, hit_entry.normal, 1, N)!
    expect(d_glass).not.toBeNull()

    // 3. Propagation dans le verre jusqu'à la face droite
    const ray_glass: Ray = { origin: hit_entry.point, direction: d_glass, wavelength: 550, intensity: 1 }
    const hit_exit = s1.intersect(ray_glass)!
    expect(hit_exit).not.toBeNull()

    // 4. Réfraction verre → air
    const d_out = refract(ray_glass.direction, hit_exit.normal, N, 1)!
    expect(d_out).not.toBeNull()

    // 5. Rayon de sortie parallèle au rayon incident
    expect(Math.abs(dot(d_out, ray_in.direction) - 1)).toBeLessThan(EPS_ANGLE)

    // 6. Décalage latéral = composante perpendiculaire du vecteur (p_exit − p_incident_étendu)
    //    p_incident_étendu : point sur le rayon incident prolongé à x = x_exit
    const exit_x = hit_exit.point.x
    const t_ext = (exit_x - ray_in.origin.x) / ray_in.direction.x
    const p_incident_ext = {
      x: ray_in.origin.x + t_ext * ray_in.direction.x,
      y: ray_in.origin.y + t_ext * ray_in.direction.y,
    }
    const delta_vec = sub(hit_exit.point, p_incident_ext)
    // Perpendiculaire à la direction du rayon : (−dy, dx)
    const perp = { x: -ray_in.direction.y, y: ray_in.direction.x }
    const delta_measured = Math.abs(dot(delta_vec, perp))

    expect(Math.abs(delta_measured - delta_expected)).toBeLessThan(1e-9)
  })

  it('rayon à incidence normale (θ₁=0) : aucun décalage latéral', () => {
    const ray = makeRay(-300, 0, 1, 0)
    const hit_e = s3.intersect(ray)!
    const d_g = refract(ray.direction, hit_e.normal, 1, N)!
    const ray_g: Ray = { origin: hit_e.point, direction: d_g, wavelength: 550, intensity: 1 }
    const hit_x = s1.intersect(ray_g)!
    const d_o = refract(ray_g.direction, hit_x.normal, N, 1)!
    // Pas de déviation → δ = 0
    const p_ext = { x: hit_x.point.x, y: ray.origin.y }
    const perp = { x: -ray.direction.y, y: ray.direction.x }
    const delta = Math.abs(dot(sub(hit_x.point, p_ext), perp))
    expect(delta).toBeLessThan(1e-9)
    // Direction de sortie identique à l'entrée
    expect(Math.abs(d_o.x - 1)).toBeLessThan(EPS_VEC)
    expect(Math.abs(d_o.y)).toBeLessThan(EPS_VEC)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Réflexion totale interne
//
// n = 1.5 → θ_c = arcsin(1/1.5) = arcsin(2/3) ≈ 41.81°
// Un rayon interne à θ > θ_c doit donner refract = null.
// ─────────────────────────────────────────────────────────────────────────────

describe('Block — réflexion totale interne (n=1.5, θ_c ≈ 41.81°)', () => {
  const N = 1.5
  const theta_c = Math.asin(1 / N)
  // Bloc large en hauteur pour éviter le clipping à angles rasants
  const b = new Block({ id: 'b', position: { x: 0, y: 0 }, angle: 0, width: 200, height: 400, n: N })
  const s1 = b.getSurfaces()[1]  // face droite

  it('angle critique = arcsin(1/n)', () => {
    expect(Math.abs(theta_c - Math.asin(1 / N))).toBeLessThan(EPS_ANGLE)
  })

  it('refract retourne null pour θ = 50° > θ_c (TIR)', () => {
    // Rayon interne à 50° (> θ_c ≈ 41.81°) vers la face droite
    // Départ en (50, 0) : hit à x=100, y = −50·tan50° ≈ −59.6, dans ±200 ✓
    const theta = 50 * DEG
    const ray = makeRay(50, 0, Math.cos(theta), -Math.sin(theta))
    const hit = s1.intersect(ray)!
    expect(hit).not.toBeNull()
    expect(refract(ray.direction, hit.normal, N, 1)).toBeNull()
  })

  it('refract réussit pour θ = 30° < θ_c', () => {
    const theta = 30 * DEG
    const ray = makeRay(50, 0, Math.cos(theta), -Math.sin(theta))
    const hit = s1.intersect(ray)!
    expect(hit).not.toBeNull()
    expect(refract(ray.direction, hit.normal, N, 1)).not.toBeNull()
  })

  it('refract retourne null pour θ = θ_c + 0.1° (juste au-dessus)', () => {
    const theta = theta_c + 0.1 * DEG
    const ray = makeRay(50, 0, Math.cos(theta), -Math.sin(theta))
    const hit = s1.intersect(ray)!
    expect(hit).not.toBeNull()
    expect(refract(ray.direction, hit.normal, N, 1)).toBeNull()
  })

  it('refract réussit pour θ = θ_c − 0.1° (juste en-dessous)', () => {
    const theta = theta_c - 0.1 * DEG
    const ray = makeRay(50, 0, Math.cos(theta), -Math.sin(theta))
    const hit = s1.intersect(ray)!
    expect(hit).not.toBeNull()
    expect(refract(ray.direction, hit.normal, N, 1)).not.toBeNull()
  })

  it('TIR sur la face supérieure (n=2.0, θ=45° > θ_c=30°)', () => {
    // n=2 : θ_c = arcsin(1/2) = 30° ; rayon interne à 45° → TIR
    const N2 = 2.0
    const b2 = new Block({ id: 'b2', position: { x: 0, y: 0 }, angle: 0, width: 400, height: 200, n: N2 })
    const s2 = b2.getSurfaces()[2]  // face supérieure TR→TL, y = +100
    // Rayon interne depuis (0,0) vers la face supérieure à 45° de la normale (y-axis)
    // d = (sin45°, cos45°) — 45° de la normale (0,1) vers la droite
    // Hit à y=100 : t = 100/cos45°, x = 100·tan45° = 100 ✓ dans ±200
    const theta = 45 * DEG
    const ray = makeRay(0, 0, Math.sin(theta), Math.cos(theta))
    const hit = s2.intersect(ray)!
    expect(hit).not.toBeNull()
    expect(refract(ray.direction, hit.normal, N2, 1)).toBeNull()
  })
})
