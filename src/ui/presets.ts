import type { Scene } from '../core/types.ts'
import { FlatMirror } from '../core/elements/flat-mirror.ts'
import { ThinLens } from '../core/elements/thin-lens.ts'
import { Block } from '../core/elements/block.ts'
import { Prism } from '../core/elements/prism.ts'
import { CurvedMirror } from '../core/elements/curved-mirror.ts'
import { ConicMirror } from '../core/elements/conic-mirror.ts'
import { ThickLens } from '../core/elements/thick-lens.ts'
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

function brewsterAngleDemo(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  // θ_B = arctan(n2/n1) = arctan(1.5) ≈ 56.31°
  // On tire à cet angle sur la face gauche du bloc.
  // Le rayon p (TM) passe intégralement (Rp = 0), le rayon s (TE) se reflète à ~14.8%.
  const thetaB = Math.atan(1.5)   // ≈ 0.9828 rad ≈ 56.31°

  // Bloc de verre n=1.5, face gauche à cx
  const blockX = cx
  const blockW = 80, blockH = 260
  const block = new Block({
    id: 'block-1', label: 'Verre n=1.5',
    position: { x: blockX, y: cy - blockH / 2 },
    angle: 0, width: blockW, height: blockH, n: 1.5,
  })

  // Les deux sources arrivent du même point (cx − 250, cy) mais décalées de ±30 px en y
  // pour séparer visuellement les deux faisceaux.
  // Angle = thetaB (direction +x, +y) → on dirige vers la face gauche du bloc.
  const srcX = cx - 250

  const beamS = new BeamSource({
    id: 'beam-s', position: { x: srcX, y: cy - 30 },
    angle: thetaB,
    wavelengths: [555], numRays: 1, width: 0,
    polarization: 's',
  })
  const beamP = new BeamSource({
    id: 'beam-p', position: { x: srcX, y: cy + 30 },
    angle: thetaB,
    wavelengths: [555], numRays: 1, width: 0,
    polarization: 'p',
  })

  return {
    elements: [block],
    sources: [beamS, beamP],
    metadata: {
      name: 'Angle de Brewster',
      description: `θ_B = arctan(1.5) ≈ 56.3°. Polarisation s (vert) : réflexion ~14.8%. Polarisation p (vert) : Rp = 0, pas de reflet.`,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────────────

function newtonTelescope(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  // Primaire parabolique (κ=−1) : vertex à cx+200, faces vers la gauche (angle=π)
  // Focale primaire f₁ = R/2 = 180 px → foyer F₁ à cx+200−180 = cx+20
  // Secondaire miroir plan à 45° (angle=3π/4) juste avant F₁, à cx+40
  // → redirige vers le bas les rayons convergeants (direction −x → direction +y)
  const primary = new ConicMirror({
    id: 'primary', label: 'Primaire (parabolique)',
    position: { x: cx + 200, y: cy },
    angle: Math.PI,
    R: 360, kappa: -1, halfHeight: 90,
  })
  const secondary = new FlatMirror({
    id: 'secondary', label: 'Secondaire (plan 45°)',
    position: { x: cx + 45, y: cy },
    angle: 3 * Math.PI / 4,
    length: 44,
  })
  return {
    elements: [primary, secondary],
    sources: [
      new BeamSource({
        id: 'beam-1', position: { x: cx - 230, y: cy },
        angle: 0, wavelengths: MONO, numRays: 7, width: 160,
      }),
    ],
    metadata: {
      name: 'Télescope de Newton',
      description: 'Primaire parabolique (κ=−1, R=360, f=180 px) + miroir secondaire plan à 45°. Foyer image à côté du tube.',
    },
  }
}

function cassegrainTelescope(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  // Primaire parabolique concave : vertex à cx+280, faces gauche, R=400, f₁=200
  // Foyer F₁ primaire à cx+280−200 = cx+80
  // Secondaire convexe (CurvedMirror concave=false) : positionné à cx+130,
  // faces droite (angle=0 → axis vers +x, normal vers les rayons arrivant par la gauche)
  // Le secondaire est avant F₁ → il intercepte le faisceau convergeant
  // et le renvoie vers la droite, à travers l'orifice central du primaire.
  const primary = new ConicMirror({
    id: 'primary', label: 'Primaire (parabolique)',
    position: { x: cx + 280, y: cy },
    angle: Math.PI,
    R: 400, kappa: -1, halfHeight: 110,
  })
  const secondary = new CurvedMirror({
    id: 'secondary', label: 'Secondaire (convexe)',
    position: { x: cx + 130, y: cy },
    angle: 0,     // faces vers +x (vers les rayons venant de la droite après réflexion primaire)
    radius: 200,
    aperture: 0.25,
    concave: false,  // miroir convexe
  })
  return {
    elements: [primary, secondary],
    sources: [
      new BeamSource({
        id: 'beam-1', position: { x: cx - 250, y: cy },
        angle: 0, wavelengths: MONO, numRays: 7, width: 180,
      }),
    ],
    metadata: {
      name: 'Télescope de Cassegrain',
      description: 'Primaire parabolique (R=400) + secondaire convexe. Le faisceau convergeant est renvoyé vers la droite à travers l\'orifice du primaire.',
    },
  }
}

function achromaticDoublet(w: number, h: number): Scene {
  const cx = w / 2, cy = h / 2
  // Doublet de Fraunhofer : couronne BK7 (f₁≈+110) + flint SF11 (f₂≈−247)
  // Condition achromatique : φ₁/V₁ + φ₂/V₂ = 0
  // V_BK7 ≈ 63, V_SF11 ≈ 28 → f_total ≈ 200 px
  //
  // BK7  plano-convexe : R1=57, R2=5000 (≈plat), épaisseur=8
  // SF11 plano-concave : R1=5000 (≈plat), R2=−194, épaisseur=6
  // Les deux lentilles sont collées (vertex2 BK7 = vertex1 SF11).
  const bk7 = new ThickLens({
    id: 'crown', label: 'N-BK7 (couronne)',
    position: { x: cx, y: cy },
    angle: 0,
    R1: 57, R2: 5000,
    kappa1: 0, kappa2: 0,
    thickness: 8, halfHeight: 45,
    n: 1.52, glassId: 'N-BK7',
  })
  const sf11 = new ThickLens({
    id: 'flint', label: 'N-SF11 (flint)',
    position: { x: cx + 7, y: cy },
    angle: 0,
    R1: 5000, R2: -194,
    kappa1: 0, kappa2: 0,
    thickness: 6, halfHeight: 45,
    n: 1.78, glassId: 'N-SF11',
  })
  return {
    elements: [bk7, sf11],
    sources: [
      new BeamSource({
        id: 'beam-1', position: { x: cx - 240, y: cy },
        angle: 0, wavelengths: WHITE, numRays: 5, width: 70,
      }),
    ],
    metadata: {
      name: 'Doublet achromatique',
      description: 'BK7 (couronne) + SF11 (flint) collés. Condition de Fraunhofer : φ₁/V₁ + φ₂/V₂ = 0, f_total ≈ 200 px. Aberration chromatique réduite.',
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
  { id: 'brewster',   label: 'Angle de Brewster',          make: brewsterAngleDemo },
  { id: 'newton',     label: 'Télescope de Newton',        make: newtonTelescope },
  { id: 'cassegrain', label: 'Télescope de Cassegrain',    make: cassegrainTelescope },
  { id: 'achromat',   label: 'Doublet achromatique',       make: achromaticDoublet },
]
