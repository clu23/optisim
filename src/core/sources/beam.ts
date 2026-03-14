import type { LightSource, Ray, Vec2 } from '../types.ts'

// ─────────────────────────────────────────────────────────────────────────────
// BeamSource — source de lumière parallèle (faisceau)
//
// Génère des rayons parallèles selon la direction `angle` (radians).
// Pour `numRays > 1`, les rayons sont espacés uniformément sur `width` pixels
// perpendiculairement à la direction du faisceau.
// Pour `numRays = 1`, un seul rayon central est émis.
//
// Les longueurs d'onde sont listées dans `wavelengths` (nm).
// Chaque (longueur d'onde × position transverse) génère un Ray indépendant.
// ─────────────────────────────────────────────────────────────────────────────

export interface BeamSourceParams {
  id: string
  position: Vec2
  /** Direction de propagation du faisceau (radians). 0 = vers +x. */
  angle: number
  /** Longueurs d'onde à émettre (nm). */
  wavelengths: number[]
  /** Nombre de rayons parallèles par longueur d'onde. Défaut : 1. */
  numRays?: number
  /** Largeur du faisceau en pixels (spread perpendiculaire). Défaut : 0. */
  width?: number
}

export class BeamSource implements LightSource {
  readonly id: string
  readonly type = 'beam' as const
  position: Vec2
  angle: number          // radians
  wavelengths: number[]
  numRays: number
  width: number

  constructor({ id, position, angle, wavelengths, numRays = 1, width = 0 }: BeamSourceParams) {
    this.id = id
    this.position = position
    this.angle = angle
    this.wavelengths = wavelengths
    this.numRays = numRays
    this.width = width
  }

  generateRays(): Ray[] {
    const rays: Ray[] = []
    // Vecteur unitaire de propagation
    const dir: Vec2 = { x: Math.cos(this.angle), y: Math.sin(this.angle) }
    // Vecteur unitaire perpendiculaire (pour le spread transverse)
    const perp: Vec2 = { x: -dir.y, y: dir.x }

    for (const wavelength of this.wavelengths) {
      for (let i = 0; i < this.numRays; i++) {
        // Position transverse : 0 si numRays = 1, sinon répartition uniforme sur [-width/2, +width/2]
        const t = this.numRays > 1
          ? (i / (this.numRays - 1) - 0.5) * this.width
          : 0
        const origin: Vec2 = {
          x: this.position.x + perp.x * t,
          y: this.position.y + perp.y * t,
        }
        rays.push({ origin, direction: dir, wavelength, intensity: 1 })
      }
    }

    return rays
  }
}
