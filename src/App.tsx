import React, { useRef, useEffect, useState, useCallback } from 'react'
import type { Scene, Vec2, TraceResult } from './core/types.ts'
import { traceRay } from './core/tracer.ts'
import { drawScene, drawHUD, drawRuler, drawOPLOverlay, drawMeasureOverlay, screenToWorld, defaultView } from './renderer/canvas-renderer.ts'
import type { ViewTransform } from './renderer/canvas-renderer.ts'
import { PropertiesPanel } from './ui/PropertiesPanel.tsx'
import { Toolbar } from './ui/Toolbar.tsx'
import { PRESETS } from './ui/presets.ts'
import { buildPrescription, prescriptionToCSV } from './core/prescription.ts'
import type { PrescriptionTable } from './core/prescription.ts'

// ─────────────────────────────────────────────────────────────────────────────
// PrescriptionModal — tableau des surfaces optiques
// ─────────────────────────────────────────────────────────────────────────────

function PrescriptionModal({ scene, scale, onClose }: {
  scene: Scene
  scale: number
  onClose: () => void
}) {
  const table: PrescriptionTable = buildPrescription(scene, scale)
  const csv = prescriptionToCSV(table)

  function downloadCSV() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'prescription.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function copyClipboard() {
    navigator.clipboard.writeText(csv).catch(() => undefined)
  }

  const fmtR = (v: number) => !isFinite(v) ? '∞' : v.toFixed(2)
  const fmtT = (v: number) => !isFinite(v) ? '∞' : v.toFixed(2)

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: '#111827', border: '1px solid #374151',
        borderRadius: 8, padding: 20, maxWidth: '90vw', maxHeight: '80vh',
        overflow: 'auto', color: '#e2e8f0', fontFamily: 'monospace', fontSize: 13,
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#93c5fd' }}>Tableau de prescription</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={copyClipboard} style={btnStyle}>Copier CSV</button>
            <button onClick={downloadCSV} style={btnStyle}>Télécharger CSV</button>
            <button onClick={onClose} style={{ ...btnStyle, color: '#f87171' }}>✕</button>
          </div>
        </div>
        <table style={{ borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
          <thead>
            <tr style={{ color: '#94a3b8', borderBottom: '1px solid #374151' }}>
              {['#', 'Label', 'Type', 'Rayon (mm)', 'Épaisseur (mm)', 'Matériau', 'nD', 'Abbe', 'R-semi (mm)', 'κ'].map(h => (
                <th key={h} style={{ padding: '4px 10px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1f2937' }}>
                <td style={tdStyle}>{i + 1}</td>
                <td style={tdStyle}>{row.label ?? '—'}</td>
                <td style={{ ...tdStyle, color: typeColor(row.type) }}>{row.type}</td>
                <td style={tdStyle}>{fmtR(row.radius)}</td>
                <td style={tdStyle}>{fmtT(row.thickness)}</td>
                <td style={tdStyle}>{row.material}</td>
                <td style={tdStyle}>{row.nD != null ? row.nD.toFixed(4) : '—'}</td>
                <td style={tdStyle}>{row.abbeNumber != null ? row.abbeNumber.toFixed(1) : '—'}</td>
                <td style={tdStyle}>{row.clearRadius != null ? row.clearRadius.toFixed(2) : '—'}</td>
                <td style={tdStyle}>{row.kappa != null ? row.kappa.toFixed(2) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {table.rows.length === 0 && (
          <div style={{ color: '#6b7280', padding: '12px 0' }}>Aucune surface dans la scène.</div>
        )}
      </div>
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 4,
  color: '#93c5fd', padding: '3px 10px', cursor: 'pointer', fontSize: 12,
}
const tdStyle: React.CSSProperties = { padding: '3px 10px' }
function typeColor(t: string) {
  if (t === 'refract') return '#6ee7b7'
  if (t === 'reflect') return '#fcd34d'
  if (t === 'stop')    return '#c4b5fd'
  if (t === 'image')   return '#93c5fd'
  return '#e2e8f0'
}

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
  const canvasRef          = useRef<HTMLCanvasElement>(null)
  const sceneRef           = useRef<Scene | null>(null)
  const traceResultsRef    = useRef<TraceResult[]>([])  // résultats courants pour le panneau
  const dragRef         = useRef<Drag | null>(null)
  const panRef          = useRef<Pan | null>(null)
  const rafRef          = useRef(0)
  const viewRef         = useRef<ViewTransform>(defaultView())
  const mouseWorldRef   = useRef<Vec2 | null>(null)
  const mouseScreenRef  = useRef<Vec2 | null>(null)
  const measureModeRef  = useRef(false)
  const measurePtsRef   = useRef<Vec2[]>([])

  // React state — drives UI re-renders (panel + toolbar)
  const [selectedId, setSelectedId]         = useState<string | null>(null)
  const [, setVersion]                      = useState(0)  // bump to trigger re-render
  const [measureModeUI, setMeasureModeUI]   = useState(false)
  const [useMm, setUseMm]                   = useState(false)
  const [showPrescription, setShowPrescription] = useState(false)

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
      traceResultsRef.current = results

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

      // Règle graduée (screen space)
      drawRuler(ctx, width, height, viewRef.current, sceneRef.current.metadata.units)

      // OPL hover (screen space)
      drawOPLOverlay(ctx, mouseScreenRef.current, mouseWorldRef.current, results, scale)

      // Measure mode overlay (screen space)
      drawMeasureOverlay(ctx, measurePtsRef.current, viewRef.current, measureModeRef.current)

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

  // ── Delete key + M (mode mesure) ───────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT') return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected()
        return
      }

      if (e.key === 'm' || e.key === 'M') {
        const next = !measureModeRef.current
        measureModeRef.current = next
        if (!next) measurePtsRef.current = []   // reset à la désactivation
        setMeasureModeUI(next)
      }
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

    // ── Mode mesure : placement des points ────────────────────────────────────
    if (measureModeRef.current) {
      const pts = measurePtsRef.current
      if (pts.length < 2) {
        measurePtsRef.current = [...pts, { ...worldPos }]
      } else {
        // 3ème clic → reset
        measurePtsRef.current = [{ ...worldPos }]
      }
      return
    }

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
    // Tracking souris (pour OPL hover)
    mouseScreenRef.current = { x: e.clientX, y: e.clientY }
    mouseWorldRef.current  = s2w(e.clientX, e.clientY)

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
      if (src) { src.position = newPos; bump() }
    } else {
      const el = sceneRef.current.elements.find(x => x.id === d.id)
      if (el) { el.position = newPos; bump() }
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
    setUseMm(sceneRef.current.metadata.units != null)
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
        style={{ display: 'block', cursor: measureModeUI ? 'cell' : 'crosshair', position: 'absolute', inset: 0 }}
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
        useMm={useMm}
        onToggleMm={() => setUseMm(v => !v)}
      />

      {/* key=selectedId remounts panel when selected element changes */}
      <PropertiesPanel
        key={selectedId}
        scene={sceneRef.current}
        selectedId={selectedId}
        onUpdate={bump}
        onDelete={deleteSelected}
        useMm={useMm}
        scale={sceneRef.current?.metadata.units?.scale ?? 1}
        traceResults={traceResultsRef.current}
      />

      {/* Bouton prescription */}
      <button
        onClick={() => setShowPrescription(v => !v)}
        style={{
          position: 'absolute', bottom: 16, right: 16,
          background: '#1e3a5f', border: '1px solid #2563eb', borderRadius: 6,
          color: '#93c5fd', padding: '6px 14px', cursor: 'pointer',
          fontSize: 12, fontFamily: 'monospace',
          boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
        }}
        title="Tableau de prescription (surfaces optiques)"
      >
        Prescription
      </button>

      {/* Modal prescription */}
      {showPrescription && sceneRef.current && (
        <PrescriptionModal
          scene={sceneRef.current}
          scale={sceneRef.current.metadata.units?.scale ?? 1}
          onClose={() => setShowPrescription(false)}
        />
      )}
    </div>
  )
}
