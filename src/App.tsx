import { useRef, useEffect } from 'react'
import type { Scene, Vec2, TraceResult } from './core/types.ts'
import { traceRay } from './core/tracer.ts'
import { Prism } from './core/elements/prism.ts'
import { BeamSource } from './core/sources/beam.ts'
import { drawScene } from './renderer/canvas-renderer.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Scène de démonstration : prisme équilatéral (n=1.5) + faisceau blanc
// ─────────────────────────────────────────────────────────────────────────────

/** Longueurs d'onde du « blanc » : violet → rouge (nm). */
const WHITE = [405, 445, 480, 515, 555, 590, 630, 670, 700]

function makeScene(canvasW: number, canvasH: number): Scene {
  const cx = canvasW / 2
  const cy = canvasH / 2

  return {
    elements: [
      new Prism({
        id: 'prism-1',
        position: { x: cx + 50, y: cy },
        // angle = π → apex vers le haut (repère canvas, y croissant vers le bas)
        angle: Math.PI,
        size: 140,
        n: 1.5,
        label: 'Prisme (n=1.5)',
      }),
    ],
    sources: [
      new BeamSource({
        id: 'beam-1',
        position: { x: cx - 220, y: cy },
        angle: 0,          // faisceau vers +x
        wavelengths: WHITE,
        numRays: 1,
        width: 0,
      }),
    ],
    metadata: { name: 'Démo — Prisme + Faisceau blanc' },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Traçage de toute la scène
// ─────────────────────────────────────────────────────────────────────────────

function traceAll(scene: Scene): TraceResult[] {
  return scene.sources.flatMap(src =>
    src.generateRays().map(ray => traceRay(ray, scene))
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// État de drag
// ─────────────────────────────────────────────────────────────────────────────

interface Drag {
  id: string
  isSource: boolean
  objStart: Vec2
  mouseStart: Vec2
}

// ─────────────────────────────────────────────────────────────────────────────
// App — composant racine
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const sceneRef   = useRef<Scene | null>(null)
  const selectedId = useRef<string | null>(null)
  const dragRef    = useRef<Drag | null>(null)
  const rafRef     = useRef(0)

  // ── Boucle de rendu principale ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!

    function resize() {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Initialisation de la scène après connaître les dimensions du canvas
    sceneRef.current = makeScene(canvas.width, canvas.height)

    function loop() {
      if (!sceneRef.current) return
      const results = traceAll(sceneRef.current)
      drawScene(ctx, sceneRef.current, results, selectedId.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // ── Molette — rotation de l'élément sélectionné ────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!

    function onWheel(e: WheelEvent) {
      const id = selectedId.current
      if (!id || !sceneRef.current) return
      e.preventDefault()
      // ~0.5° par cran de molette standard
      const delta = e.deltaY * 0.005
      const el  = sceneRef.current.elements.find(x => x.id === id)
      if (el) { el.angle += delta; return }
      const src = sceneRef.current.sources.find(x => x.id === id)
      if (src) src.angle += delta
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  // ── Hit testing ────────────────────────────────────────────────────────────

  function hitTest(pos: Vec2): { id: string; isSource: boolean; objPos: Vec2 } | null {
    if (!sceneRef.current) return null
    const { elements, sources } = sceneRef.current
    const M = 12  // marge de clic en px

    // Éléments — ordre inverse (dernier dessiné = priorité au clic)
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]
      const bb = el.getBoundingBox()
      if (pos.x >= bb.min.x - M && pos.x <= bb.max.x + M &&
          pos.y >= bb.min.y - M && pos.y <= bb.max.y + M) {
        return { id: el.id, isSource: false, objPos: { ...el.position } }
      }
    }

    // Sources — proximité
    for (const src of sources) {
      if (Math.hypot(pos.x - src.position.x, pos.y - src.position.y) < 32) {
        return { id: src.id, isSource: true, objPos: { ...src.position } }
      }
    }

    return null
  }

  // ── Handlers souris ────────────────────────────────────────────────────────

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    const pos: Vec2 = { x: e.clientX, y: e.clientY }
    const hit = hitTest(pos)
    selectedId.current = hit?.id ?? null
    if (hit) {
      dragRef.current = {
        id: hit.id,
        isSource: hit.isSource,
        objStart: hit.objPos,
        mouseStart: pos,
      }
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const d = dragRef.current
    if (!d || !sceneRef.current) return
    const dx = e.clientX - d.mouseStart.x
    const dy = e.clientY - d.mouseStart.y
    const newPos: Vec2 = { x: d.objStart.x + dx, y: d.objStart.y + dy }

    if (d.isSource) {
      const src = sceneRef.current.sources.find(s => s.id === d.id)
      if (src) src.position = newPos
    } else {
      const el = sceneRef.current.elements.find(x => x.id === d.id)
      if (el) el.position = newPos
    }
  }

  function onMouseUp() {
    dragRef.current = null
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ display: 'block', cursor: 'crosshair' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    />
  )
}
