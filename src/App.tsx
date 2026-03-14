import { useRef, useEffect, useState, useCallback } from 'react'
import type { Scene, Vec2, TraceResult } from './core/types.ts'
import { traceRay } from './core/tracer.ts'
import { drawScene } from './renderer/canvas-renderer.ts'
import { PropertiesPanel } from './ui/PropertiesPanel.tsx'
import { Toolbar } from './ui/Toolbar.tsx'
import { PRESETS } from './ui/presets.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Trace all rays in scene
// ─────────────────────────────────────────────────────────────────────────────

function traceAll(scene: Scene): TraceResult[] {
  return scene.sources.flatMap(src =>
    src.generateRays().map(ray => traceRay(ray, scene))
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag state
// ─────────────────────────────────────────────────────────────────────────────

interface Drag {
  id: string
  isSource: boolean
  objStart: Vec2
  mouseStart: Vec2
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const sceneRef   = useRef<Scene | null>(null)
  const dragRef    = useRef<Drag | null>(null)
  const rafRef     = useRef(0)
  const dimRef     = useRef({ w: window.innerWidth, h: window.innerHeight })

  // React state — drives UI re-renders (panel + toolbar)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [version, setVersion]       = useState(0)  // bump to refresh panel
  const [canvasSize, setCanvasSize] = useState({ w: window.innerWidth, h: window.innerHeight })

  // Keep a ref in sync so RAF / event handlers can read without stale closure
  const selectedIdRef = useRef<string | null>(null)
  useEffect(() => { selectedIdRef.current = selectedId }, [selectedId])

  const bump = useCallback(() => setVersion(v => v + 1), [])

  // ── Canvas init + RAF loop ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx    = canvas.getContext('2d')!

    function resize() {
      canvas.width  = window.innerWidth
      canvas.height = window.innerHeight
      dimRef.current = { w: canvas.width, h: canvas.height }
      setCanvasSize({ w: canvas.width, h: canvas.height })
    }
    resize()
    window.addEventListener('resize', resize)

    // Load default preset
    sceneRef.current = PRESETS[0].make(canvas.width, canvas.height)

    function loop() {
      if (!sceneRef.current) return
      const results = traceAll(sceneRef.current)
      drawScene(ctx, sceneRef.current, results, selectedIdRef.current)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // ── Wheel: fine rotation (0.1°/cran, Shift → 5°/cran) ────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!
    function onWheel(e: WheelEvent) {
      const id = selectedIdRef.current
      if (!id || !sceneRef.current) return
      e.preventDefault()
      const deg  = e.shiftKey ? 5 : 0.1
      const delta = Math.sign(e.deltaY) * deg * (Math.PI / 180)
      const el  = sceneRef.current.elements.find(x => x.id === id)
      if (el)  { el.angle += delta; bump(); return }
      const src = sceneRef.current.sources.find(x => x.id === id)
      if (src) { src.angle += delta; bump() }
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [bump])

  // ── Delete key ─────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if ((e.target as HTMLElement).tagName === 'INPUT') return
      deleteSelected()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  // ── Hit testing ────────────────────────────────────────────────────────────
  function hitTest(pos: Vec2): { id: string; isSource: boolean; objPos: Vec2 } | null {
    if (!sceneRef.current) return null
    const { elements, sources } = sceneRef.current
    const M = 12

    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]
      const bb = el.getBoundingBox()
      if (pos.x >= bb.min.x - M && pos.x <= bb.max.x + M &&
          pos.y >= bb.min.y - M && pos.y <= bb.max.y + M) {
        return { id: el.id, isSource: false, objPos: { ...el.position } }
      }
    }
    for (const src of sources) {
      if (Math.hypot(pos.x - src.position.x, pos.y - src.position.y) < 32) {
        return { id: src.id, isSource: true, objPos: { ...src.position } }
      }
    }
    return null
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    // Don't steal focus from panel inputs
    if ((e.target as HTMLElement) !== canvasRef.current) return
    const pos: Vec2 = { x: e.clientX, y: e.clientY }
    const hit = hitTest(pos)
    const newId = hit?.id ?? null
    setSelectedId(newId)
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

  function onMouseUp() { dragRef.current = null }

  // ── Toolbar callbacks ──────────────────────────────────────────────────────
  function handleLoadPreset(presetId: string) {
    const preset = PRESETS.find(p => p.id === presetId)
    if (!preset) return
    sceneRef.current = preset.make(dimRef.current.w, dimRef.current.h)
    setSelectedId(null)
    bump()
  }

  function handleAddToScene(_scene: Scene) {
    // scene is already mutated by Toolbar; just force panel refresh
    bump()
  }

  function deleteSelected() {
    const id = selectedIdRef.current
    if (!id || !sceneRef.current) return
    sceneRef.current.elements = sceneRef.current.elements.filter(e => e.id !== id)
    sceneRef.current.sources  = sceneRef.current.sources.filter(s => s.id !== id)
    setSelectedId(null)
    bump()
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor: 'crosshair', position: 'absolute', inset: 0 }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />

      <Toolbar
        canvasW={canvasSize.w}
        canvasH={canvasSize.h}
        onSceneRef={() => sceneRef.current}
        onAddToScene={handleAddToScene}
        onLoadPreset={handleLoadPreset}
        onSelectId={id => { setSelectedId(id); bump() }}
      />

      {/* key=selectedId+version forces React to re-mount panel on target change */}
      <PropertiesPanel
        key={`${selectedId}-${version}`}
        scene={sceneRef.current}
        selectedId={selectedId}
        onUpdate={bump}
        onDelete={deleteSelected}
      />
    </div>
  )
}
