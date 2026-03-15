import { useRef, useEffect, useState, useCallback } from 'react'
import type { Scene, Vec2, TraceResult } from './core/types.ts'
import { traceRay } from './core/tracer.ts'
import { drawScene, drawHUD, screenToWorld, defaultView } from './renderer/canvas-renderer.ts'
import type { ViewTransform } from './renderer/canvas-renderer.ts'
import { PropertiesPanel } from './ui/PropertiesPanel.tsx'
import { Toolbar } from './ui/Toolbar.tsx'
import { PRESETS } from './ui/presets.ts'

// ─────────────────────────────────────────────────────────────────────────────
// Fit view to scene — calcule pan + zoom pour que toute la scène soit visible
// ─────────────────────────────────────────────────────────────────────────────

function fitScene(scene: Scene, vpW: number, vpH: number): ViewTransform {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

  function expand(x: number, y: number, r = 0) {
    minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r)
    minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r)
  }

  for (const el of scene.elements) {
    const bb = el.getBoundingBox()
    expand(bb.min.x, bb.min.y)
    expand(bb.max.x, bb.max.y)
  }
  for (const src of scene.sources) {
    // Les sources sont des points — on leur donne un rayon fixe
    expand(src.position.x, src.position.y, 60)
  }

  if (!isFinite(minX)) {
    // Scène vide : vue par défaut (origine au centre)
    return { offsetX: vpW / 2, offsetY: vpH / 2, scale: 1 }
  }

  const sceneW   = Math.max(maxX - minX, 1)
  const sceneH   = Math.max(maxY - minY, 1)
  const sceneCx  = (minX + maxX) / 2
  const sceneCy  = (minY + maxY) / 2

  // La scène occupe 20 % du viewport (40 % de marge par côté)
  const FILL  = 0.20
  const scale = Math.min(
    (vpW * FILL) / sceneW,
    (vpH * FILL) / sceneH,
    4,   // ne pas zoomer au-delà de 4× pour une scène minuscule
  )

  return {
    scale,
    offsetX: vpW / 2 - sceneCx * scale,
    offsetY: vpH / 2 - sceneCy * scale,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Trace all rays in scene
// ─────────────────────────────────────────────────────────────────────────────

function traceAll(scene: Scene): TraceResult[] {
  return scene.sources.flatMap(src =>
    src.generateRays().map(ray => traceRay(ray, scene))
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Drag state (world-space coordinates)
// ─────────────────────────────────────────────────────────────────────────────

interface Drag {
  id: string
  isSource: boolean
  objStart: Vec2        // world position of object at drag start
  worldMouseStart: Vec2 // world position of mouse at drag start
}

// ─────────────────────────────────────────────────────────────────────────────
// Pan state
// ─────────────────────────────────────────────────────────────────────────────

interface Pan {
  mouseStart: Vec2
  viewStart: ViewTransform
}

// ─────────────────────────────────────────────────────────────────────────────
// App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const sceneRef   = useRef<Scene | null>(null)
  const dragRef    = useRef<Drag | null>(null)
  const panRef     = useRef<Pan | null>(null)
  const rafRef     = useRef(0)
  const viewRef    = useRef<ViewTransform>(defaultView())

  // React state — drives UI re-renders (panel + toolbar)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [version, setVersion]       = useState(0)  // bump to refresh panel

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
    }
    resize()
    window.addEventListener('resize', resize)

    // Load default preset then fit the view to its bounding box
    sceneRef.current = PRESETS[0].make(canvas.width, canvas.height)
    viewRef.current  = fitScene(sceneRef.current, canvas.width, canvas.height)

    function loop() {
      if (!sceneRef.current) return
      const { width, height } = canvas
      const { offsetX, offsetY, scale } = viewRef.current

      // World-space bounds visible on screen
      const worldBounds = {
        left:   -offsetX / scale,
        top:    -offsetY / scale,
        right:  (width  - offsetX) / scale,
        bottom: (height - offsetY) / scale,
      }

      const results = traceAll(sceneRef.current)

      // Background clear (screen space)
      ctx.fillStyle = '#080c14'
      ctx.fillRect(0, 0, width, height)

      // World-space content (transformed)
      ctx.save()
      ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY)
      drawScene(ctx, sceneRef.current, results, selectedIdRef.current, worldBounds, scale)
      ctx.restore()

      // HUD overlay (screen space)
      drawHUD(ctx, width, height, scale)

      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // ── Helper: screen → world ─────────────────────────────────────────────────
  function s2w(sx: number, sy: number): Vec2 {
    return screenToWorld(sx, sy, viewRef.current)
  }

  // ── Wheel: zoom (no selection) or rotate (selection) ──────────────────────
  useEffect(() => {
    const canvas = canvasRef.current!
    function onWheel(e: WheelEvent) {
      e.preventDefault()
      const id = selectedIdRef.current

      if (id && sceneRef.current) {
        // Rotate selected element
        const deg   = e.shiftKey ? 5 : 0.1
        const delta = Math.sign(e.deltaY) * deg * (Math.PI / 180)
        const el  = sceneRef.current.elements.find(x => x.id === id)
        if (el)  { el.angle += delta; bump(); return }
        const src = sceneRef.current.sources.find(x => x.id === id)
        if (src) { src.angle += delta; bump() }
      } else {
        // Zoom centered on mouse cursor
        const factor   = e.deltaY < 0 ? 1.1 : 1 / 1.1
        const v        = viewRef.current
        const newScale = Math.max(0.05, Math.min(20, v.scale * factor))
        viewRef.current = {
          scale:   newScale,
          offsetX: e.clientX - (e.clientX - v.offsetX) / v.scale * newScale,
          offsetY: e.clientY - (e.clientY - v.offsetY) / v.scale * newScale,
        }
      }
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

  // ── Hit testing (world space) ───────────────────────────────────────────────
  function hitTest(worldPos: Vec2): { id: string; isSource: boolean; objPos: Vec2 } | null {
    if (!sceneRef.current) return null
    const { elements, sources } = sceneRef.current
    // Hit margin in world pixels (constant 12 screen px)
    const M = 12 / viewRef.current.scale

    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]
      const bb = el.getBoundingBox()
      if (worldPos.x >= bb.min.x - M && worldPos.x <= bb.max.x + M &&
          worldPos.y >= bb.min.y - M && worldPos.y <= bb.max.y + M) {
        return { id: el.id, isSource: false, objPos: { ...el.position } }
      }
    }
    const srcRadius = 32 / viewRef.current.scale
    for (const src of sources) {
      if (Math.hypot(worldPos.x - src.position.x, worldPos.y - src.position.y) < srcRadius) {
        return { id: src.id, isSource: true, objPos: { ...src.position } }
      }
    }
    return null
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if ((e.target as HTMLElement) !== canvasRef.current) return

    // Middle mouse → pan
    if (e.button === 1) {
      e.preventDefault()
      panRef.current = {
        mouseStart: { x: e.clientX, y: e.clientY },
        viewStart: { ...viewRef.current },
      }
      return
    }

    if (e.button !== 0) return

    const worldPos = s2w(e.clientX, e.clientY)
    const hit = hitTest(worldPos)
    const newId = hit?.id ?? null
    setSelectedId(newId)

    if (hit) {
      dragRef.current = {
        id: hit.id,
        isSource: hit.isSource,
        objStart: hit.objPos,
        worldMouseStart: worldPos,
      }
    } else {
      // Left-drag on background → pan
      panRef.current = {
        mouseStart: { x: e.clientX, y: e.clientY },
        viewStart: { ...viewRef.current },
      }
    }
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    // Pan takes priority
    const pan = panRef.current
    if (pan) {
      viewRef.current = {
        scale:   pan.viewStart.scale,
        offsetX: pan.viewStart.offsetX + (e.clientX - pan.mouseStart.x),
        offsetY: pan.viewStart.offsetY + (e.clientY - pan.mouseStart.y),
      }
      return
    }

    // Drag element / source
    const d = dragRef.current
    if (!d || !sceneRef.current) return
    const worldPos = s2w(e.clientX, e.clientY)
    const newPos: Vec2 = {
      x: d.objStart.x + (worldPos.x - d.worldMouseStart.x),
      y: d.objStart.y + (worldPos.y - d.worldMouseStart.y),
    }
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
    panRef.current  = null
  }

  // ── Toolbar callbacks ──────────────────────────────────────────────────────
  function handleLoadPreset(presetId: string) {
    const preset = PRESETS.find(p => p.id === presetId)
    if (!preset) return
    const canvas = canvasRef.current!
    sceneRef.current = preset.make(canvas.width, canvas.height)
    viewRef.current  = fitScene(sceneRef.current, canvas.width, canvas.height)
    setSelectedId(null)
    bump()
  }

  function handleAddToScene(_scene: Scene) {
    bump()
  }

  function handleSceneLoaded(scene: Scene) {
    const canvas = canvasRef.current!
    sceneRef.current = scene
    viewRef.current  = fitScene(scene, canvas.width, canvas.height)
    setSelectedId(null)
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
        onContextMenu={e => e.preventDefault()}
      />

      <Toolbar
        canvasW={window.innerWidth}
        canvasH={window.innerHeight}
        onSceneRef={() => sceneRef.current}
        onAddToScene={handleAddToScene}
        onLoadPreset={handleLoadPreset}
        onSelectId={id => { setSelectedId(id); bump() }}
        onSceneLoaded={handleSceneLoaded}
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
