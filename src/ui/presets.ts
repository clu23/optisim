import type { Scene } from '../core/types.ts'
import { FlatMirror } from '../core/elements/flat-mirror.ts'
import { ThinLens } from '../core/elements/thin-lens.ts'
import { Prism } from '../core/elements/prism.ts'
import { CurvedMirror } from '../core/elements/curved-mirror.ts'
import { GRINElement } from '../core/elements/grin-medium.ts'
import { BeamSource } from '../core/sources/beam.ts'
import { PointSource } from '../core/sources/point-source.ts'

const WHITE = [405, 445, 480, 515, 555, 590, 630, 670, 700]
const MONO  = [555]

// ─────────────────────────────────────────────────────────────────────────────

export interface Preset {
  id: string
  label: string
  make: (w: number, h: number) => Scene
}

// ─────────────────────────────────────────────────────────────────────────────

function prismDispersion(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  return {
    elements: [
      new Prism({ id: 'prism-1', position: { x: cx + 40, y: cy }, angle: Math.PI, size: 140, n: 1.5 }),
    ],
    sources: [
      new BeamSource({ id: 'beam-1', position: { x: cx - 230, y: cy }, angle: 0, wavelengths: WHITE, numRays: 1, width: 0 }),
    ],
    metadata: { name: 'Dispersion — Prisme', description: 'Prisme équilatéral n=1.5, faisceau blanc' },
  }
}

function convergingLens(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  return {
    elements: [
      new ThinLens({ id: 'lens-1', position: { x: cx, y: cy }, angle: 0, focalLength: 120, height: 160 }),
    ],
    sources: [
      new BeamSource({ id: 'beam-1', position: { x: cx - 260, y: cy }, angle: 0, wavelengths: MONO, numRays: 7, width: 120 }),
    ],
    metadata: { name: 'Lentille convergente (f=120)', description: 'V4 : faisceau parallèle → foyer image' },
  }
}

function divergingLens(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  return {
    elements: [
      new ThinLens({ id: 'lens-1', position: { x: cx, y: cy }, angle: 0, focalLength: -120, height: 160 }),
    ],
    sources: [
      new BeamSource({ id: 'beam-1', position: { x: cx - 260, y: cy }, angle: 0, wavelengths: MONO, numRays: 7, width: 120 }),
    ],
    metadata: { name: 'Lentille divergente (f=−120)', description: 'Faisceau parallèle diverge depuis le foyer virtuel' },
  }
}

function concaveMirror(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  return {
    elements: [
      new CurvedMirror({
        id: 'mirror-1',
        position: { x: cx + 180, y: cy },
        // Miroir face à gauche : axe vers -x (angle = π)
        angle: Math.PI,
        radius: 220,
        aperture: 0.45,
        concave: true,
      }),
    ],
    sources: [
      new BeamSource({ id: 'beam-1', position: { x: cx - 220, y: cy }, angle: 0, wavelengths: MONO, numRays: 7, width: 120 }),
    ],
    metadata: { name: 'Miroir concave', description: 'V9 : rayons parallèles convergent au foyer f=R/2' },
  }
}

function doubleMirror(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  return {
    elements: [
      // Miroir horizontal en bas
      new FlatMirror({ id: 'mirror-1', position: { x: cx + 40, y: cy + 120 }, angle: 0, length: 200 }),
      // Miroir vertical à droite (45°)
      new FlatMirror({ id: 'mirror-2', position: { x: cx + 140, y: cy }, angle: Math.PI / 4, length: 200 }),
    ],
    sources: [
      new BeamSource({ id: 'beam-1', position: { x: cx - 220, y: cy + 120 }, angle: 0, wavelengths: MONO, numRays: 3, width: 30 }),
    ],
    metadata: { name: 'Double miroir', description: 'Deux miroirs plans — réflexions multiples' },
  }
}

function diamondDispersion(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  // Prisme diamant apex 25° — en dessous de l'angle critique (≈24.4°) les rayons
  // peuvent sortir par la face de droite sans réflexion totale interne.
  return {
    elements: [
      new Prism({
        id: 'prism-1',
        position: { x: cx + 40, y: cy },
        angle: Math.PI,
        size: 160,
        apexAngle: 25 * Math.PI / 180,
        n: 2.42,
        material: 'diamond',
        label: 'Diamant 25°',
      }),
    ],
    sources: [
      new BeamSource({ id: 'beam-1', position: { x: cx - 230, y: cy }, angle: 0, wavelengths: WHITE, numRays: 1, width: 0 }),
    ],
    metadata: { name: 'Dispersion — Diamant', description: 'Prisme diamant apex 25°, forte dispersion (V≈44)' },
  }
}

function pointSourceDemo(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  return {
    elements: [
      new ThinLens({ id: 'lens-1', position: { x: cx + 80, y: cy }, angle: 0, focalLength: 110, height: 200 }),
    ],
    sources: [
      new PointSource({ id: 'point-1', position: { x: cx - 140, y: cy }, angle: 0, wavelengths: MONO, numRays: 9, spreadAngle: Math.PI / 4 }),
    ],
    metadata: { name: 'Source ponctuelle + lentille', description: 'Conjugaison par lentille convergente' },
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function grinFiber(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  // Fibre GRIN parabolique : n(r) = 1.5·(1 − 0.015²r²/2)
  // Période T = 2π/0.015 ≈ 419 px → la fibre fait ~1.3 périodes
  const alpha  = 0.015
  const gW = 560, gH = 180
  const gX = cx - gW / 2, gY = cy - gH / 2

  return {
    elements: [
      new GRINElement({
        id: 'grin-1', label: 'Fibre GRIN',
        position: { x: gX, y: gY },
        width: gW, height: gH,
        profile: 'parabolic', n0: 1.5, alpha,
      }),
    ],
    sources: [
      // 5 rayons parallèles à l'entrée de la fibre, ±30px du centre
      // Positionnés à x=gX (bord gauche) pour entrer directement dans le GRIN
      new BeamSource({
        id: 'beam-1',
        position: { x: gX, y: cy },
        angle: 0,
        wavelengths: [555],
        numRays: 5,
        width: 60,
      }),
    ],
    metadata: {
      name: 'Fibre GRIN',
      description: `Profil parabolique n(r)=1.5(1−α²r²/2), α=${alpha} px⁻¹, T=2π/α≈419 px. Trajectoires sinusoïdales.`,
    },
  }
}

function atmosphericMirage(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  // Gradient linéaire transverse : n décroît de haut en bas (α<0)
  // → n plus élevé en haut (air frais / ciel) que en bas (air chaud / sol)
  // → les rayons près du bas se courbent vers le haut = effet mirage
  const alpha  = -0.0002   // Δn/px, négatif → n décroît avec y (vers le bas)
  const n0     = 1.06      // indice au centre
  const gW = 700, gH = 260
  const gX = cx - gW / 2, gY = cy - gH / 2
  // Source : 5 rayons proches du bas de la zone (y = cy + 80 à cy + 40)
  // → courbure vers le haut (vers les n plus élevés)
  const srcY = cy + 60

  return {
    elements: [
      new GRINElement({
        id: 'grin-1', label: 'Atmosphère',
        position: { x: gX, y: gY },
        width: gW, height: gH,
        profile: 'linear', n0, alpha,
      }),
    ],
    sources: [
      new BeamSource({
        id: 'beam-1',
        position: { x: gX, y: srcY },
        angle: 0,
        wavelengths: [555],
        numRays: 5,
        width: 80,
      }),
    ],
    metadata: {
      name: 'Mirage atmosphérique',
      description: `Gradient linéaire α=${alpha} Δn/px : n décroît vers le bas. Les rayons proches du sol se courbent vers le ciel.`,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export const PRESETS: Preset[] = [
  { id: 'prism',      label: 'Dispersion — Prisme',       make: prismDispersion },
  { id: 'diamond',    label: 'Dispersion — Diamant',      make: diamondDispersion },
  { id: 'conv-lens',  label: 'Lentille convergente',       make: convergingLens },
  { id: 'div-lens',   label: 'Lentille divergente',        make: divergingLens },
  { id: 'concave',    label: 'Miroir concave',             make: concaveMirror },
  { id: 'double-mir', label: 'Double miroir',              make: doubleMirror },
  { id: 'point-src',  label: 'Source ponctuelle',          make: pointSourceDemo },
  { id: 'grin-fiber', label: 'Fibre GRIN',                 make: grinFiber },
  { id: 'mirage',     label: 'Mirage atmosphérique',       make: atmosphericMirage },
]
