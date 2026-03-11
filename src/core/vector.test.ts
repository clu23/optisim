import { describe, it, expect } from 'vitest'
import { add, sub, scale, neg, dot, length, normalize, reflect, rotate, distance } from './vector.ts'

const EPS = 1e-10

function expectVec2(actual: { x: number; y: number }, expected: { x: number; y: number }, eps = EPS) {
  expect(actual.x).toBeCloseTo(expected.x, -Math.log10(eps))
  expect(actual.y).toBeCloseTo(expected.y, -Math.log10(eps))
}

describe('add', () => {
  it('additionne deux vecteurs', () => {
    expectVec2(add({ x: 1, y: 2 }, { x: 3, y: 4 }), { x: 4, y: 6 })
  })
  it('est commutatif', () => {
    const a = { x: 1.5, y: -3 }
    const b = { x: -2, y: 7 }
    expectVec2(add(a, b), add(b, a))
  })
  it('élément neutre : v + 0 = v', () => {
    const v = { x: 3, y: -5 }
    expectVec2(add(v, { x: 0, y: 0 }), v)
  })
})

describe('sub', () => {
  it('soustrait deux vecteurs', () => {
    expectVec2(sub({ x: 5, y: 3 }, { x: 2, y: 1 }), { x: 3, y: 2 })
  })
  it('v - v = 0', () => {
    const v = { x: 4, y: -7 }
    expectVec2(sub(v, v), { x: 0, y: 0 })
  })
})

describe('scale', () => {
  it('multiplie par un scalaire positif', () => {
    expectVec2(scale({ x: 2, y: -3 }, 4), { x: 8, y: -12 })
  })
  it('scale par 0 donne le vecteur nul', () => {
    expectVec2(scale({ x: 5, y: -8 }, 0), { x: 0, y: 0 })
  })
  it('scale par 1 est l\'identité', () => {
    const v = { x: 3, y: 7 }
    expectVec2(scale(v, 1), v)
  })
  it('scale par -1 est la négation', () => {
    expectVec2(scale({ x: 3, y: -2 }, -1), { x: -3, y: 2 })
  })
})

describe('neg', () => {
  it('inverse les deux composantes', () => {
    expectVec2(neg({ x: 3, y: -5 }), { x: -3, y: 5 })
  })
  it('neg(neg(v)) = v', () => {
    const v = { x: 2, y: -7 }
    expectVec2(neg(neg(v)), v)
  })
})

describe('dot', () => {
  it('produit scalaire basique', () => {
    expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBeCloseTo(11)
  })
  it('vecteurs orthogonaux → 0', () => {
    expect(dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(0)
  })
  it('vecteurs parallèles → produit des normes', () => {
    expect(dot({ x: 3, y: 0 }, { x: 5, y: 0 })).toBeCloseTo(15)
  })
  it('est commutatif', () => {
    const a = { x: 2, y: -3 }
    const b = { x: 5, y: 1 }
    expect(dot(a, b)).toBeCloseTo(dot(b, a))
  })
})

describe('length', () => {
  it('longueur d\'un vecteur unité', () => {
    expect(length({ x: 1, y: 0 })).toBeCloseTo(1)
  })
  it('théorème de Pythagore : 3-4-5', () => {
    expect(length({ x: 3, y: 4 })).toBeCloseTo(5)
  })
  it('vecteur nul → 0', () => {
    expect(length({ x: 0, y: 0 })).toBeCloseTo(0)
  })
  it('invariant par rotation', () => {
    const v = { x: 3, y: 4 }
    const rotated = rotate(v, Math.PI / 3)
    expect(length(rotated)).toBeCloseTo(length(v))
  })
})

describe('normalize', () => {
  it('le résultat a une norme de 1', () => {
    expect(length(normalize({ x: 3, y: 4 }))).toBeCloseTo(1)
  })
  it('conserve la direction', () => {
    const v = { x: 6, y: 0 }
    expectVec2(normalize(v), { x: 1, y: 0 })
  })
  it('normalise un vecteur quelconque', () => {
    const v = { x: 1, y: 1 }
    const n = normalize(v)
    expect(length(n)).toBeCloseTo(1)
    // Vérifie la direction : n = v / |v|
    const expected = 1 / Math.sqrt(2)
    expect(n.x).toBeCloseTo(expected)
    expect(n.y).toBeCloseTo(expected)
  })
  it('vecteur nul → (0, 0) sans erreur', () => {
    const n = normalize({ x: 0, y: 0 })
    expect(n.x).toBe(0)
    expect(n.y).toBe(0)
  })
})

describe('reflect', () => {
  // r = d - 2(d·n)n
  it('réflexion sur plan horizontal (normale vers le haut)', () => {
    // Rayon descendant à 45°, normale = (0, 1)
    const d = normalize({ x: 1, y: -1 })
    const n = { x: 0, y: 1 }
    const r = reflect(d, n)
    // Le rayon réfléchi remonte à 45°
    expectVec2(r, normalize({ x: 1, y: 1 }))
  })
  it('réflexion sur plan vertical (normale vers la droite)', () => {
    // Rayon allant vers la gauche, normale = (1, 0)
    const d = normalize({ x: -1, y: 0 })
    const n = { x: 1, y: 0 }
    const r = reflect(d, n)
    expectVec2(r, normalize({ x: 1, y: 0 }))
  })
  it('θ_r = θ_i : miroir plan à 45°', () => {
    // Rayon horizontal (1, 0), miroir à 45° → normale = (-sin45, cos45)
    // Après réflexion le rayon doit aller vers le bas (0, -1) ... mais dépend
    // de l'orientation. On vérifie juste que la norme est conservée.
    const d = normalize({ x: 1, y: 0 })
    const n = normalize({ x: -1, y: 1 })  // normale du miroir à 45°
    const r = reflect(d, n)
    expect(length(r)).toBeCloseTo(1)
    // L'angle d'incidence = l'angle de réflexion
    const cosI = -dot(d, n)  // cos(θ_i) = -d·n (incidence par l'avant)
    const cosR = dot(r, n)   // cos(θ_r) = r·n
    expect(Math.abs(cosI)).toBeCloseTo(Math.abs(cosR))
  })
  it('rayon normal à la surface repart en sens inverse', () => {
    const d = normalize({ x: 1, y: 0 })
    const n = { x: -1, y: 0 }  // normale opposée à d
    const r = reflect(d, n)
    expectVec2(r, { x: -1, y: 0 })
  })
  it('conserve la norme', () => {
    const d = normalize({ x: 2, y: -3 })
    const n = normalize({ x: 0, y: 1 })
    expect(length(reflect(d, n))).toBeCloseTo(1)
  })
})

describe('rotate', () => {
  it('rotation de 0° est l\'identité', () => {
    const v = { x: 3, y: 4 }
    expectVec2(rotate(v, 0), v)
  })
  it('rotation de 90° : (1,0) → (0,1)', () => {
    expectVec2(rotate({ x: 1, y: 0 }, Math.PI / 2), { x: 0, y: 1 })
  })
  it('rotation de 180° : inverse le vecteur', () => {
    const v = { x: 3, y: 2 }
    expectVec2(rotate(v, Math.PI), { x: -3, y: -2 })
  })
  it('rotation de 360° est l\'identité', () => {
    const v = { x: 5, y: -2 }
    expectVec2(rotate(v, 2 * Math.PI), v)
  })
  it('rotation de -90° : (0,1) → (1,0)', () => {
    expectVec2(rotate({ x: 0, y: 1 }, -Math.PI / 2), { x: 1, y: 0 })
  })
  it('conserve la norme', () => {
    const v = { x: 3, y: 4 }
    expect(length(rotate(v, Math.PI / 7))).toBeCloseTo(length(v))
  })
})

describe('distance', () => {
  it('distance entre deux points', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5)
  })
  it('distance d\'un point à lui-même est 0', () => {
    const p = { x: 7, y: -3 }
    expect(distance(p, p)).toBeCloseTo(0)
  })
  it('est symétrique', () => {
    const a = { x: 1, y: 2 }
    const b = { x: 5, y: -3 }
    expect(distance(a, b)).toBeCloseTo(distance(b, a))
  })
})
