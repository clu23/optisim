import { describe, it, expect } from 'vitest'
import { intersectRaySegment, intersectRayCircle } from './intersection.ts'
import type { Ray } from './types.ts'
import { length, dot } from './vector.ts'

// ─── Helpers ────────────────────────────────────────────────────────────────

function ray(ox: number, oy: number, dx: number, dy: number): Ray {
  const len = Math.sqrt(dx * dx + dy * dy)
  return {
    origin: { x: ox, y: oy },
    direction: { x: dx / len, y: dy / len },
    wavelength: 550,
    intensity: 1,
  }
}

function near(a: number, b: number, eps = 1e-9) {
  expect(Math.abs(a - b)).toBeLessThan(eps)
}

// ─── intersectRaySegment ────────────────────────────────────────────────────

describe('intersectRaySegment', () => {

  it('rayon horizontal touche un segment vertical au milieu', () => {
    const r = ray(0, 0, 1, 0)
    const hit = intersectRaySegment(r, { x: 5, y: -2 }, { x: 5, y: 2 })
    expect(hit).not.toBeNull()
    near(hit!.t, 5)
    near(hit!.point.x, 5)
    near(hit!.point.y, 0)
  })

  it('rayon parallèle au segment → pas d\'intersection', () => {
    const r = ray(0, 0, 1, 0)
    const hit = intersectRaySegment(r, { x: 0, y: 1 }, { x: 5, y: 1 })
    expect(hit).toBeNull()
  })

  it('rayon colinéaire au segment (dégénéré) → pas d\'intersection', () => {
    const r = ray(0, 0, 1, 0)
    const hit = intersectRaySegment(r, { x: 2, y: 0 }, { x: 5, y: 0 })
    expect(hit).toBeNull()
  })

  it('intersection derrière l\'origine du rayon (t < 0) → pas d\'intersection', () => {
    const r = ray(10, 0, 1, 0)            // rayon qui va vers la droite
    const hit = intersectRaySegment(r, { x: 5, y: -1 }, { x: 5, y: 1 }) // segment à x=5 (derrière)
    expect(hit).toBeNull()
  })

  it('rayon rate le segment (u hors [0,1])', () => {
    // Segment de y=3 à y=5 (ne couvre pas y=0)
    const r = ray(0, 0, 1, 0)
    const hit = intersectRaySegment(r, { x: 3, y: 3 }, { x: 3, y: 5 })
    expect(hit).toBeNull()
  })

  it('rayon touche l\'extrémité du segment (u = 0)', () => {
    const r = ray(0, 0, 1, 0)
    const hit = intersectRaySegment(r, { x: 4, y: 0 }, { x: 4, y: 3 })
    expect(hit).not.toBeNull()
    near(hit!.point.x, 4)
    near(hit!.point.y, 0, 1e-6)
  })

  it('rayon touche l\'extrémité du segment (u = 1)', () => {
    const r = ray(0, 0, 1, 0)
    const hit = intersectRaySegment(r, { x: 4, y: -3 }, { x: 4, y: 0 })
    expect(hit).not.toBeNull()
    near(hit!.point.x, 4)
    near(hit!.point.y, 0, 1e-6)
  })

  it('normale orientée vers le rayon incident : dot(direction, normal) < 0', () => {
    const r = ray(0, 0, 1, 0)
    const hit = intersectRaySegment(r, { x: 3, y: -2 }, { x: 3, y: 2 })
    expect(hit).not.toBeNull()
    expect(dot(r.direction, hit!.normal)).toBeLessThan(0)
  })

  it('normale unitaire', () => {
    // Segment de (3,-2) à (3,2) : ne passe pas par l'origine
    const r = ray(0, 0, 1, 1)
    const hit = intersectRaySegment(r, { x: 3, y: -2 }, { x: 3, y: 4 })
    expect(hit).not.toBeNull()
    near(length(hit!.normal), 1, 1e-9)
  })

  it('normale du bon côté selon la direction d\'arrivée', () => {
    const seg = { a: { x: 5, y: -3 }, b: { x: 5, y: 3 } }
    // Rayon venant de gauche
    const rLeft = ray(0, 0, 1, 0)
    const hitLeft = intersectRaySegment(rLeft, seg.a, seg.b)
    expect(hitLeft!.normal.x).toBeLessThan(0) // normale pointe vers la gauche (vers le rayon)

    // Rayon venant de droite
    const rRight = ray(10, 0, -1, 0)
    const hitRight = intersectRaySegment(rRight, seg.a, seg.b)
    expect(hitRight!.normal.x).toBeGreaterThan(0) // normale pointe vers la droite
  })

  it('rayon diagonal touche un segment diagonal', () => {
    // Rayon de (0,0) vers (1,1), segment de (2,0) à (0,2) → croisent en (1,1)
    const r = ray(0, 0, 1, 1)
    const hit = intersectRaySegment(r, { x: 2, y: 0 }, { x: 0, y: 2 })
    expect(hit).not.toBeNull()
    near(hit!.point.x, 1, 1e-9)
    near(hit!.point.y, 1, 1e-9)
  })

  it('segment dégénéré (A = B) → pas d\'intersection', () => {
    const r = ray(0, 0, 1, 0)
    const hit = intersectRaySegment(r, { x: 3, y: 0 }, { x: 3, y: 0 })
    expect(hit).toBeNull()
  })

})

// ─── intersectRayCircle ─────────────────────────────────────────────────────

describe('intersectRayCircle', () => {

  it('rayon traversant le centre → t = distance au bord avant', () => {
    // Cercle centré en (5, 0), rayon 2, rayon horizontal depuis (0, 0)
    const r = ray(0, 0, 1, 0)
    const hit = intersectRayCircle(r, { x: 5, y: 0 }, 2)
    expect(hit).not.toBeNull()
    near(hit!.t, 3) // entre en x=3 (= 5 - 2)
    near(hit!.point.x, 3)
    near(hit!.point.y, 0)
  })

  it('rayon rate le cercle → pas d\'intersection', () => {
    const r = ray(0, 0, 1, 0)
    const hit = intersectRayCircle(r, { x: 5, y: 5 }, 1)
    expect(hit).toBeNull()
  })

  it('rayon tangent au cercle → intersection retournée', () => {
    // Rayon horizontal y=1, cercle centré en (5, 0), rayon 1 → tangent en (5, 1)
    const r = ray(0, 1, 1, 0)
    const hit = intersectRayCircle(r, { x: 5, y: 0 }, 1)
    expect(hit).not.toBeNull()
    near(hit!.point.x, 5, 1e-9)
    near(hit!.point.y, 1, 1e-9)
  })

  it('rayon depuis l\'intérieur du cercle → ressort par le bord opposé', () => {
    // Cercle centré en origine, rayon 10 ; rayon depuis (0, 0) vers (1, 0)
    const r = ray(0, 0, 1, 0)
    const hit = intersectRayCircle(r, { x: 0, y: 0 }, 10)
    expect(hit).not.toBeNull()
    near(hit!.t, 10)
    near(hit!.point.x, 10)
  })

  it('cercle entièrement derrière le rayon → pas d\'intersection', () => {
    const r = ray(20, 0, 1, 0)   // rayon part de x=20 vers la droite
    const hit = intersectRayCircle(r, { x: 5, y: 0 }, 2) // cercle à x=5
    expect(hit).toBeNull()
  })

  it('normale orientée vers le rayon incident : dot(direction, normal) < 0', () => {
    const r = ray(0, 0, 1, 0)
    const hit = intersectRayCircle(r, { x: 5, y: 0 }, 2)
    expect(hit).not.toBeNull()
    expect(dot(r.direction, hit!.normal)).toBeLessThan(0)
  })

  it('normale unitaire', () => {
    const r = ray(0, 0, 1, 1)
    const hit = intersectRayCircle(r, { x: 4, y: 4 }, 3)
    expect(hit).not.toBeNull()
    near(length(hit!.normal), 1, 1e-9)
  })

  it('normale radiale : normale pointe du centre vers le point d\'impact (face extérieure)', () => {
    // Rayon extérieur : la normale doit pointer vers le rayon (i.e. vers l'extérieur du cercle)
    const r = ray(0, 2, 1, 0)
    const center = { x: 5, y: 0 }
    const radius = 3
    const hit = intersectRayCircle(r, center, radius)
    expect(hit).not.toBeNull()
    // La normale doit pointer vers y > 0 (vers le haut, vers le rayon)
    expect(hit!.normal.y).toBeGreaterThan(0)
  })

  // ─── Tests avec contrainte d'arc ─────────────────────────────────────────

  it('arc : intersection dans l\'arc → hit', () => {
    // Cercle centré en (5, 0), rayon 2 ; arc sur la face gauche (angle = π)
    const r = ray(0, 0, 1, 0)
    const hit = intersectRayCircle(r, { x: 5, y: 0 }, 2, {
      center: Math.PI,        // arc centré à gauche
      halfAngle: Math.PI / 2, // ±90°
    })
    expect(hit).not.toBeNull()
    near(hit!.point.x, 3) // face gauche du cercle en x=3
  })

  it('arc : intersection hors de l\'arc → pas de hit', () => {
    // Rayon horizontal y=0, cercle en (5,0) rayon 2.
    // Points d'intersection : (3,0) angle=π et (7,0) angle=0.
    // Arc centré en haut (π/2) ± 45° → couvre [45°, 135°] : ni π ni 0 n'y sont
    const r = ray(0, 0, 1, 0)
    const hit = intersectRayCircle(r, { x: 5, y: 0 }, 2, {
      center: Math.PI / 2,    // arc centré en haut
      halfAngle: Math.PI / 4, // ±45°
    })
    expect(hit).toBeNull()
  })

  it('arc : rayon tangent au bord de l\'arc → hit si dans la tolérance', () => {
    // Rayon horizontal y=0, cercle centré en (5, 0), rayon 2
    // Arc centré à π/2 (haut) avec halfAngle = π/2 → de 0 à π (demi-supérieur)
    // Le point (3, 0) est à l'angle π → juste à la limite de l'arc
    const r = ray(0, 0, 1, 0)
    const hit = intersectRayCircle(r, { x: 5, y: 0 }, 2, {
      center: Math.PI / 2,
      halfAngle: Math.PI / 2,
    })
    expect(hit).not.toBeNull()
  })

  it('arc : gestion du recouvrement ±π (arc centré à π)', () => {
    // Arc centré à π ± π/3, rayon atteignant le côté gauche (angle ≈ π)
    const r = ray(0, 0, 1, 0)
    const hit = intersectRayCircle(r, { x: 5, y: 0 }, 2, {
      center: Math.PI,
      halfAngle: Math.PI / 3,
    })
    expect(hit).not.toBeNull()
  })

  it('arc : miroir concave face au rayon — convergence approchée', () => {
    // 3 rayons parallèles → cercle concave (miroir sphérique), rayon de courbure 10
    // Centre de courbure en (10, 0), miroir sur la face gauche (x≈0)
    // Les rayons partent de x=-5 pour être bien à l'extérieur du cercle
    const center = { x: 10, y: 0 }
    const radius = 10
    const arc = { center: Math.PI, halfAngle: Math.PI / 4 }

    const offsets = [-2, 0, 2]
    const hits = offsets.map(dy => {
      const r = ray(-5, dy, 1, 0)
      return intersectRayCircle(r, center, radius, arc)
    })

    // Tous les rayons parallèles doivent toucher la face concave gauche
    hits.forEach(hit => expect(hit).not.toBeNull())
  })

})
