import type { LightSource, Ray, Vec2 } from '../types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// PointSource — source ponctuelle éméttant un faisceau divergent
//
// Émet `numRays` rayons répartis uniformément sur `spreadAngle` radians,
// centrés sur `angle`. Pour un 360° complet, utiliser spreadAngle = 2π.
// ─────────────────────────────────────────────────────────────────────────────

export interface PointSourceParams {
  id: string
  position: Vec2
  /** Direction centrale du faisceau (radians). */
  angle: number
  wavelengths: number[]
  /** Nombre de rayons émis par longueur d'onde. Défaut : 8. */
  numRays?: number
  /** Demi-angle total du faisceau (radians). Défaut : 2π (omnidirectionnel). */
  spreadAngle?: number
}

export class PointSource implements LightSource {
  readonly id: string
  readonly type = 'point' as const
  position: Vec2
  angle: number
  wavelengths: number[]
  numRays: number
  spreadAngle: number

  constructor({
    id, position, angle, wavelengths,
    numRays = 16, spreadAngle = 2 * Math.PI,
  }: PointSourceParams) {
    this.id = id
    this.position = position
    this.angle = angle
    this.wavelengths = wavelengths
    this.numRays = numRays
    this.spreadAngle = spreadAngle
  }

  generateRays(): Ray[] {
    const rays: Ray[] = []
    const origin: Vec2 = { ...this.position }

    for (const wavelength of this.wavelengths) {
      for (let i = 0; i < this.numRays; i++) {
        const t = this.numRays > 1
          ? i / (this.numRays - 1) - 0.5
          : 0
        const a = this.angle + t * this.spreadAngle
        const dir: Vec2 = { x: Math.cos(a), y: Math.sin(a) }
        rays.push({ origin, direction: dir, wavelength, intensity: 1 })
      }
    }
    return rays
  }
}
