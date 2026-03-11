import type { Vec2 } from './types.ts'

// Additionne deux vecteurs
export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y }
}

// Soustrait b de a
export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y }
}

// Multiplie un vecteur par un scalaire
export function scale(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s }
}

// Négation
export function neg(v: Vec2): Vec2 {
  return { x: -v.x, y: -v.y }
}

// Produit scalaire (dot product)
export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y
}

// Norme (longueur) du vecteur
export function length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y)
}

// Normalise un vecteur (vecteur unitaire)
// Retourne { x: 0, y: 0 } si le vecteur est nul (longueur < ε)
export function normalize(v: Vec2): Vec2 {
  const len = length(v)
  if (len < 1e-12) return { x: 0, y: 0 }
  return { x: v.x / len, y: v.y / len }
}

// Réflexion vectorielle : r = d - 2(d·n)n
// d : direction incidente, n : normale unitaire orientée vers l'incident
export function reflect(d: Vec2, n: Vec2): Vec2 {
  const c = 2 * dot(d, n)
  return sub(d, scale(n, c))
}

// Rotation d'un vecteur par un angle en radians (sens trigonométrique)
export function rotate(v: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: v.x * cos - v.y * sin,
    y: v.x * sin + v.y * cos,
  }
}

// Distance entre deux points
export function distance(a: Vec2, b: Vec2): number {
  return length(sub(b, a))
}
