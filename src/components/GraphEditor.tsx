import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import type { GraphNode, GraphEdge } from '../types'

export interface GraphEditorHandle {
  exportImage: () => string | null
  getContainer: () => HTMLDivElement | null
}

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  directed: boolean
  highlightEdges?: (string | { id: string; color: string })[]
  highlightNodes?: (string | { id: string; color: string; border?: string })[]
  onDeleteNode?: (id: string) => void
  onDeleteEdge?: (from: string, to: string) => void
  onEdgeClick?: (from: string, to: string, weight: number) => void
  onCanvasClick?: () => void
  compact?: boolean
  editable?: boolean
  onNodeDragEnd?: (id: string, x: number, y: number) => void
  theme?: 'dark' | 'light'
  stepType?: 'explore' | 'select' | 'reject' | 'complete'
}

const NODE_CYAN = '#06B6D4'
const EDGE_COLOR = '#334155'
const HIGHLIGHT_COLOR = '#16a34a'

const NODE_RADIUS = 28
const EDGE_HIT_THRESHOLD = 12

const DARK_BG = '#0F172A'
const LIGHT_BG = '#F1F5F9'
const DARK_TEXT = '#F8FAFC'
const LIGHT_TEXT = '#0F172A'

const ARROW_SIZE = 14
const ARROW_ANGLE = Math.PI / 7

function getNodeColor(safeTheme: string): string {
  return NODE_CYAN
}

function getEdgeColor(safeTheme: string): string {
  return safeTheme === 'dark' ? '#334155' : '#94A3B8'
}

function getCanvasBg(safeTheme: string): string {
  return safeTheme === 'dark' ? DARK_BG : LIGHT_BG
}

function getFontColor(safeTheme: string): string {
  return safeTheme === 'dark' ? DARK_TEXT : LIGHT_TEXT
}

function nodeRadius(label: string): number {
  const len = label.trim().length
  if (len <= 1) return 24
  if (len <= 2) return 28
  if (len <= 4) return 32
  return 38
}

function nodeFontSize(label: string, radius: number): number {
  const len = label.trim().length
  if (len <= 1) return Math.max(20, Math.round(radius * 0.88))
  if (len <= 2) return Math.max(17, Math.round(radius * 0.75))
  if (len <= 4) return Math.max(15, Math.round(radius * 0.62))
  return Math.max(14, Math.round(radius * 0.55))
}

function computeForceDirectedLayout(nodeIds: string[], edges: GraphEdge[]): { x: number; y: number }[] {
  const n = nodeIds.length
  if (n <= 1) return [{ x: 0, y: 0 }]

  const idToIndex = new Map<string, number>()
  nodeIds.forEach((id, i) => idToIndex.set(id, i))

  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const e of edges) {
    const i = idToIndex.get(e.from)
    const j = idToIndex.get(e.to)
    if (i !== undefined && j !== undefined && i !== j) {
      adj[i].push(j)
      adj[j].push(i)
    }
  }

  const pos: { x: number; y: number }[] = []
  const circleR = Math.max(100, n * 20)
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2
    pos.push({ x: Math.round(circleR * Math.cos(angle)), y: Math.round(circleR * Math.sin(angle)) })
  }

  if (n < 3) return pos

  const idealLength = 130
  const repulsion = 12000
  const attraction = 0.4
  const gravity = 0.008
  const damping = 0.8
  const iterations = 120

  for (let iter = 0; iter < iterations; iter++) {
    const forces = pos.map(() => ({ x: 0, y: 0 }))
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = pos[j].x - pos[i].x
        let dy = pos[j].y - pos[i].y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const force = repulsion / (dist * dist + 1)
        const fx = force * (dx / dist)
        const fy = force * (dy / dist)
        forces[i].x -= fx
        forces[i].y -= fy
        forces[j].x += fx
        forces[j].y += fy
      }
    }
    for (let i = 0; i < n; i++) {
      for (const j of adj[i]) {
        if (j <= i) continue
        let dx = pos[j].x - pos[i].x
        let dy = pos[j].y - pos[i].y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const disp = dist - idealLength
        const force = attraction * disp
        const fx = force * (dx / dist)
        const fy = force * (dy / dist)
        forces[i].x += fx
        forces[i].y += fy
        forces[j].x -= fx
        forces[j].y -= fy
      }
    }
    for (let i = 0; i < n; i++) {
      forces[i].x -= pos[i].x * gravity
      forces[i].y -= pos[i].y * gravity
      pos[i].x += Math.round(forces[i].x * damping)
      pos[i].y += Math.round(forces[i].y * damping)
    }
  }

  let cx = 0, cy = 0
  for (const p of pos) { cx += p.x; cy += p.y }
  cx /= n; cy /= n
  for (const p of pos) { p.x = Math.round(p.x - cx); p.y = Math.round(p.y - cy) }

  const maxDist = Math.max(...pos.map(p => Math.sqrt(p.x * p.x + p.y * p.y)), 1)
  const targetMax = Math.max(120, n * 28)
  if (maxDist > targetMax) {
    const s = targetMax / maxDist
    for (const p of pos) { p.x = Math.round(p.x * s); p.y = Math.round(p.y * s) }
  }

  return pos
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay))
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.sqrt((px - cx) * (px - cx) + (py - cy) * (py - cy))
}

function getHighlightColor(stepType?: string): string {
  if (stepType === 'reject') return '#ef4444'
  if (stepType === 'explore') return '#06b6d4'
  return HIGHLIGHT_COLOR
}

function getNodeBg(stepType?: string): string {
  if (stepType === 'reject') return '#991b1b'
  if (stepType === 'explore') return '#0e7490'
  return '#166534'
}

function getNodeBorder(stepType?: string): string {
  if (stepType === 'reject') return '#FCA5A5'
  if (stepType === 'explore') return '#22d3ee'
  return '#4ADE80'
}

export default forwardRef<GraphEditorHandle, Props>(function GraphEditor({
  nodes, edges, directed, highlightEdges, highlightNodes,
  onDeleteNode, onDeleteEdge, onEdgeClick, onCanvasClick,
  compact, editable, onNodeDragEnd, theme, stepType
}: Props, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const dragRef = useRef<{ id: string; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null)
  const hoveredNodeRef = useRef<string | null>(null)
  const hoveredEdgeRef = useRef<{ from: string; to: string } | null>(null)
  const nodePositionsRef = useRef<Map<string, { x: number; y: number }>>(new Map())

  const onEdgeClickRef = useRef(onEdgeClick)
  onEdgeClickRef.current = onEdgeClick
  const onCanvasClickRef = useRef(onCanvasClick)
  onCanvasClickRef.current = onCanvasClick
  const onNodeDragEndRef = useRef(onNodeDragEnd)
  onNodeDragEndRef.current = onNodeDragEnd
  const onDeleteNodeRef = useRef(onDeleteNode)
  onDeleteNodeRef.current = onDeleteNode

  const renderRef = useRef<() => void>(() => {})
  const safeTheme = theme || 'dark'
  const isDark = safeTheme === 'dark'

  useImperativeHandle(ref, () => ({
    exportImage: () => {
      const canvas = canvasRef.current
      if (!canvas) return null
      return canvas.toDataURL('image/png')
    },
    getContainer: () => containerRef.current,
  }))

  // Build node positions map
  useEffect(() => {
    const ids = nodes.map(n => n.id)
    const positions = computeForceDirectedLayout(ids, edges)
    const map = new Map<string, { x: number; y: number }>()
    nodes.forEach((n, i) => {
      const p = n.x !== undefined ? { x: n.x, y: n.y! } : (positions[i] || { x: 0, y: 0 })
      map.set(n.id, p)
    })
    nodePositionsRef.current = map
  }, [nodes, edges])

  renderRef.current = render

  // Canvas sizing
  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = container.clientWidth
      const h = container.clientHeight
      canvas.style.width = w + 'px'
      canvas.style.height = h + 'px'
      canvas.width = w * dpr
      canvas.height = h * dpr
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      render()
    }

    const ro = new ResizeObserver(resize)
    ro.observe(container)
    resize()

    return () => ro.disconnect()
  }, [])

  // Render when data changes
  useEffect(() => {
    render()
  })

  function render() {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = container.clientWidth
    const h = container.clientHeight
    ctx.clearRect(0, 0, w, h)

    const posMap = nodePositionsRef.current
    if (posMap.size === 0) return

    // Compute bounds to center graph
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of posMap.values()) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
    const graphW = maxX - minX || 1
    const graphH = maxY - minY || 1
    const margin = 60
    const scaleX = (w - margin * 2) / graphW
    const scaleY = (h - margin * 2) / graphH
    const scale = Math.min(1, Math.min(scaleX, scaleY))
    const offsetX = (w - graphW * scale) / 2 - minX * scale
    const offsetY = (h - graphH * scale) / 2 - minY * scale

    const toCanvas = (p: { x: number; y: number }) => ({
      x: p.x * scale + offsetX,
      y: p.y * scale + offsetY,
    })

    const canvasPositions = new Map<string, { x: number; y: number }>()
    for (const [id, p] of posMap) {
      canvasPositions.set(id, toCanvas(p))
    }

    // Edge highlighting set
    const highlightEdgeSet = new Map<string, string>()
    if (highlightEdges) {
      for (const h of highlightEdges) {
        if (typeof h === 'string') {
          highlightEdgeSet.set(h, getHighlightColor(stepType))
        } else {
          highlightEdgeSet.set(h.id, h.color)
        }
      }
    }

    // Node highlighting set
    const highlightNodeBg = new Map<string, string>()
    const highlightNodeBorder = new Map<string, string>()
    if (highlightNodes) {
      for (const h of highlightNodes) {
        if (typeof h === 'string') {
          const bg = getNodeBg(stepType)
          const border = getNodeBorder(stepType)
          highlightNodeBg.set(h, bg)
          highlightNodeBorder.set(h, border)
        } else {
          highlightNodeBg.set(h.id, h.color || getNodeBg(stepType))
          highlightNodeBorder.set(h.id, h.border || h.color || getNodeBorder(stepType))
        }
      }
    }

    // Draw edges
    const edgePositions: { from: { x: number; y: number }; to: { x: number; y: number }; fromId: string; toId: string; weight: number }[] = []

    for (const e of edges) {
      const fromPos = canvasPositions.get(e.from)
      const toPos = canvasPositions.get(e.to)
      if (!fromPos || !toPos || e.from === e.to) continue

      // Check if this edge should be highlighted
      let edgeColor = getEdgeColor(safeTheme)
      let edgeWidth = 3
      let isHighlighted = false
      let hlColor: string | undefined = undefined

      if (directed) {
        hlColor = highlightEdgeSet.get(`${e.from}->${e.to}`) || highlightEdgeSet.get(`${e.from}-${e.to}`)
      } else {
        const possibleKeys = [
          `${e.from}->${e.to}`,
          `${e.to}->${e.from}`,
          `${e.from}-${e.to}`,
          `${e.to}-${e.from}`
        ]
        for (const k of possibleKeys) {
          if (highlightEdgeSet.has(k)) {
            hlColor = highlightEdgeSet.get(k)
            break
          }
        }
      }

      if (hlColor) {
        edgeColor = hlColor
        edgeWidth = 5
        isHighlighted = true
      }

      // Check if we are in resolution/animation mode (not editable) and there are highlighted edges
      const isResolutionMode = !editable && highlightEdges && highlightEdges.length > 0
      const alpha = (isResolutionMode && !isHighlighted) ? 0.25 : 1.0

      ctx.save()
      ctx.globalAlpha = alpha

      const isHovered = hoveredEdgeRef.current?.from === e.from && hoveredEdgeRef.current?.to === e.to

      // Check for reverse edge (directed)
      const hasReverse = directed && edges.some(other => other.from === e.to && other.to === e.from)

      // Adjust end point to node border
      const r = nodeRadius(e.from)
      const dx = toPos.x - fromPos.x
      const dy = toPos.y - fromPos.y
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
      const ux = dx / dist
      const uy = dy / dist

      const fromRad = nodeRadius(e.from) * scale
      const toRad = nodeRadius(e.to) * scale

      let startX = fromPos.x + ux * fromRad
      let startY = fromPos.y + uy * fromRad
      let endX = toPos.x - ux * toRad
      let endY = toPos.y - uy * toRad

      // Curve for reverse edges
      let curveOffset = 0
      if (hasReverse) {
        curveOffset = 18 * scale
        const midX = (startX + endX) / 2
        const midY = (startY + endY) / 2
        const nx = -uy
        const ny = ux
        const cx = midX + nx * curveOffset
        const cy = midY + ny * curveOffset

        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.quadraticCurveTo(cx, cy, endX, endY)
        ctx.strokeStyle = edgeColor
        ctx.lineWidth = edgeWidth
        if (isHovered && editable) {
          ctx.setLineDash([6, 4])
        }
        ctx.stroke()
        ctx.setLineDash([])

        // Arrow at end for directed
        if (directed) {
          const t = 0.95
          const atX = (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * cx + t * t * endX
          const atY = (1 - t) * (1 - t) * startY + 2 * (1 - t) * t * cy + t * t * endY
          const next = 0.96
          const nextX = (1 - next) * (1 - next) * startX + 2 * (1 - next) * next * cx + next * next * endX
          const nextY = (1 - next) * (1 - next) * startY + 2 * (1 - next) * next * cy + next * next * endY
          const adx = atX - nextX
          const ady = atY - nextY
          const aDist = Math.max(Math.sqrt(adx * adx + ady * ady), 1)
          const aux = adx / aDist
          const auy = ady / aDist
          ctx.fillStyle = edgeColor
          ctx.beginPath()
          ctx.moveTo(atX, atY)
          ctx.lineTo(atX - aux * ARROW_SIZE * scale * Math.cos(ARROW_ANGLE) + auy * ARROW_SIZE * scale * 0.5,
                     atY - auy * ARROW_SIZE * scale * Math.cos(ARROW_ANGLE) - aux * ARROW_SIZE * scale * 0.5)
          ctx.lineTo(atX - aux * ARROW_SIZE * scale * Math.cos(ARROW_ANGLE) - auy * ARROW_SIZE * scale * 0.5,
                     atY - auy * ARROW_SIZE * scale * Math.cos(ARROW_ANGLE) + aux * ARROW_SIZE * scale * 0.5)
          ctx.closePath()
          ctx.fill()
        }

        // Label at midpoint of curve
        const labelMidX = (startX + endX) / 2 + nx * curveOffset * 0.7
        const labelMidY = (startY + endY) / 2 + ny * curveOffset * 0.7

        const label = String(e.weight)
        const fontSize = 13
        ctx.font = `600 ${Math.round(fontSize)}px Arial`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.lineWidth = 5
        ctx.strokeStyle = getCanvasBg(safeTheme)
        const metrics = ctx.measureText(label)
        const pad = 4 * scale
        const lw = metrics.width + pad * 2
        const lh = fontSize * 1.3
        ctx.fillStyle = getCanvasBg(safeTheme)
        ctx.fillRect(labelMidX - lw / 2, labelMidY - lh / 2, lw, lh)
        ctx.strokeStyle = getCanvasBg(safeTheme)
        ctx.strokeRect(labelMidX - lw / 2, labelMidY - lh / 2, lw, lh)
        ctx.fillStyle = getFontColor(safeTheme)
        ctx.fillText(label, labelMidX, labelMidY)
      } else {
        // Straight edge
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.lineTo(endX, endY)
        ctx.strokeStyle = edgeColor
        ctx.lineWidth = edgeWidth
        if (isHovered && editable) {
          ctx.setLineDash([6, 4])
        }
        ctx.stroke()
        ctx.setLineDash([])

        // Arrow at end for directed
        if (directed) {
          ctx.fillStyle = edgeColor
          ctx.beginPath()
          ctx.moveTo(endX, endY)
          ctx.lineTo(endX - ux * ARROW_SIZE * scale * Math.cos(ARROW_ANGLE) + uy * ARROW_SIZE * scale * 0.5,
                     endY - uy * ARROW_SIZE * scale * Math.cos(ARROW_ANGLE) - ux * ARROW_SIZE * scale * 0.5)
          ctx.lineTo(endX - ux * ARROW_SIZE * scale * Math.cos(ARROW_ANGLE) - uy * ARROW_SIZE * scale * 0.5,
                     endY - uy * ARROW_SIZE * scale * Math.cos(ARROW_ANGLE) + ux * ARROW_SIZE * scale * 0.5)
          ctx.closePath()
          ctx.fill()
        }

        // Weight label at midpoint
        const midX = (startX + endX) / 2
        const midY = (startY + endY) / 2
        const label = String(e.weight)
        const fontSize = 13
        ctx.font = `600 ${Math.round(fontSize)}px Arial`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const metrics = ctx.measureText(label)
        const pad = 4 * scale
        const lw = metrics.width + pad * 2
        const lh = fontSize * 1.3
        ctx.fillStyle = getCanvasBg(safeTheme)
        ctx.fillRect(midX - lw / 2, midY - lh / 2, lw, lh)
        ctx.fillStyle = getFontColor(safeTheme)
        ctx.fillText(label, midX, midY)
      }

      ctx.restore()

      edgePositions.push({ from: fromPos, to: toPos, fromId: e.from, toId: e.to, weight: e.weight })
    }

    // Draw nodes
    for (const n of nodes) {
      const pos = canvasPositions.get(n.id)
      if (!pos) continue

      const radius = nodeRadius(n.label) * scale
      const isSelected = selectedNodeId === n.id
      const isHovered = hoveredNodeRef.current === n.id

      const nBg = highlightNodeBg.get(n.id) || (isSelected ? '#0369A1' : isHovered ? '#0284C7' : NODE_CYAN)
      const nBorder = highlightNodeBorder.get(n.id) || (isSelected ? '#E0F2FE' : isHovered ? '#BAE6FD' : NODE_CYAN)

      // Shadow
      ctx.save()
      ctx.shadowColor = 'rgba(15, 23, 42, 0.28)'
      ctx.shadowBlur = 8
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 4

      ctx.beginPath()
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = nBg
      ctx.fill()
      ctx.lineWidth = isSelected ? 4 : 2
      ctx.strokeStyle = nBorder
      ctx.stroke()
      ctx.restore()

      // Label
      const fs = nodeFontSize(n.label, nodeRadius(n.label)) * scale
      ctx.font = `600 ${Math.round(fs)}px Arial`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#FFFFFF'
      ctx.fillText(n.label, pos.x, pos.y + Math.max(1, Math.round(fs * 0.06)))
    }
  }

  // Mouse handlers
  const getMousePos = useCallback((e: React.MouseEvent<HTMLCanvasElement> | MouseEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }, [])

  const findNodeAt = useCallback((mx: number, my: number): string | null => {
    const posMap = nodePositionsRef.current
    if (posMap.size === 0) return null

    const container = containerRef.current
    if (!container) return null
    const w = container.clientWidth
    const h = container.clientHeight

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of posMap.values()) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
    }
    const graphW = maxX - minX || 1
    const graphH = maxY - minY || 1
    const margin = 60
    const scaleX = (w - margin * 2) / graphW
    const scaleY = (h - margin * 2) / graphH
    const scale = Math.min(1, Math.min(scaleX, scaleY))
    const offsetX = (w - graphW * scale) / 2 - minX * scale
    const offsetY = (h - graphH * scale) / 2 - minY * scale

    // Check in reverse order (topmost first)
    const reversed = [...nodes].reverse()
    for (const n of reversed) {
      const p = posMap.get(n.id)
      if (!p) continue
      const cx = p.x * scale + offsetX
      const cy = p.y * scale + offsetY
      const r = nodeRadius(n.label) * scale
      const dx = mx - cx
      const dy = my - cy
      if (dx * dx + dy * dy <= r * r) return n.id
    }
    return null
  }, [nodes])

  const findEdgeAt = useCallback((mx: number, my: number): { from: string; to: string } | null => {
    const posMap = nodePositionsRef.current
    if (posMap.size === 0) return null

    const container = containerRef.current
    if (!container) return null
    const w = container.clientWidth
    const h = container.clientHeight

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of posMap.values()) {
      if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y
    }
    const graphW = maxX - minX || 1
    const graphH = maxY - minY || 1
    const margin = 60
    const scaleX = (w - margin * 2) / graphW
    const scaleY = (h - margin * 2) / graphH
    const scale = Math.min(1, Math.min(scaleX, scaleY))
    const offsetX = (w - graphW * scale) / 2 - minX * scale
    const offsetY = (h - graphH * scale) / 2 - minY * scale

    const threshold = EDGE_HIT_THRESHOLD

    for (const e of edges) {
      const fromP = posMap.get(e.from)
      const toP = posMap.get(e.to)
      if (!fromP || !toP || e.from === e.to) continue

      const ax = fromP.x * scale + offsetX
      const ay = fromP.y * scale + offsetY
      const bx = toP.x * scale + offsetX
      const by = toP.y * scale + offsetY

      const dist = distanceToSegment(mx, my, ax, ay, bx, by)
      if (dist < threshold) return { from: e.from, to: e.to }
    }
    return null
  }, [edges])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editable) return
    const pos = getMousePos(e)
    const nodeId = findNodeAt(pos.x, pos.y)
    if (nodeId) {
      const p = nodePositionsRef.current.get(nodeId)
      if (p) {
        setSelectedNodeId(nodeId)
        const container = containerRef.current
        if (!container) return
        const w = container.clientWidth
        const h = container.clientHeight

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const pp of nodePositionsRef.current.values()) {
          if (pp.x < minX) minX = pp.x; if (pp.y < minY) minY = pp.y
          if (pp.x > maxX) maxX = pp.x; if (pp.y > maxY) maxY = pp.y
        }
        const graphW = maxX - minX || 1
        const graphH = maxY - minY || 1
        const margin = 60
        const scaleX = (w - margin * 2) / graphW
        const scaleY = (h - margin * 2) / graphH
        const scale = Math.min(1, Math.min(scaleX, scaleY))
        const offsetX = (w - graphW * scale) / 2 - minX * scale
        const offsetY = (h - graphH * scale) / 2 - minY * scale

        dragRef.current = {
          id: nodeId,
          startX: pos.x,
          startY: pos.y,
          offsetX: p.x * scale + offsetX,
          offsetY: p.y * scale + offsetY,
        }
      }
    } else {
      setSelectedNodeId(null)
      const edgeFound = findEdgeAt(pos.x, pos.y)
      if (edgeFound) {
        const edge = edges.find(e => e.from === edgeFound.from && e.to === edgeFound.to)
        if (edge && onEdgeClickRef.current) {
          onEdgeClickRef.current(edge.from, edge.to, edge.weight)
        }
      } else if (onCanvasClickRef.current) {
        onCanvasClickRef.current()
      }
    }
  }, [editable, getMousePos, findNodeAt, findEdgeAt, edges])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!editable) return

    // Handle drag
    if (dragRef.current) {
      const pos = getMousePos(e)
      const dx = pos.x - dragRef.current.startX
      const dy = pos.y - dragRef.current.startY
      const p = nodePositionsRef.current.get(dragRef.current.id)
      if (p) {
        const container = containerRef.current
        if (!container) return
        const w = container.clientWidth
        const h = container.clientHeight

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const pp of nodePositionsRef.current.values()) {
          if (pp.x < minX) minX = pp.x; if (pp.y < minY) minY = pp.y
          if (pp.x > maxX) maxX = pp.x; if (pp.y > maxY) maxY = pp.y
        }
        const graphW = maxX - minX || 1
        const graphH = maxY - minY || 1
        const margin = 60
        const scaleX = (w - margin * 2) / graphW
        const scaleY = (h - margin * 2) / graphH
        const scale = Math.min(1, Math.min(scaleX, scaleY))
        const offsetX = (w - graphW * scale) / 2 - minX * scale
        const offsetY = (h - graphH * scale) / 2 - minY * scale

        const newGraphX = (pos.x - offsetX) / scale
        const newGraphY = (pos.y - offsetY) / scale
        nodePositionsRef.current.set(dragRef.current.id, { x: Math.round(newGraphX), y: Math.round(newGraphY) })
        renderRef.current()
      }
      return
    }

    // Handle hover
    const pos = getMousePos(e)
    const nodeId = findNodeAt(pos.x, pos.y)
    const edgeFound = findEdgeAt(pos.x, pos.y)

    const prevHoveredNode = hoveredNodeRef.current
    const prevHoveredEdge = hoveredEdgeRef.current

    hoveredNodeRef.current = nodeId
    hoveredEdgeRef.current = edgeFound

    if (prevHoveredNode !== nodeId || prevHoveredEdge !== edgeFound) {
      const canvas = canvasRef.current
      if (canvas) canvas.style.cursor = nodeId || edgeFound ? 'pointer' : 'default'
      renderRef.current()
    }
  }, [editable, getMousePos, findNodeAt, findEdgeAt])

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragRef.current) {
      const p = nodePositionsRef.current.get(dragRef.current.id)
      if (p && onNodeDragEndRef.current) {
        onNodeDragEndRef.current(dragRef.current.id, p.x, p.y)
      }
      dragRef.current = null
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    if (!dragRef.current) {
      hoveredNodeRef.current = null
      hoveredEdgeRef.current = null
      dragRef.current = null
      const canvas = canvasRef.current
      if (canvas) canvas.style.cursor = 'default'
      renderRef.current()
    }
  }, [])

  useEffect(() => {
    if (selectedNodeId && !nodes.some(n => n.id === selectedNodeId)) {
      setSelectedNodeId(null)
    }
  }, [nodes, selectedNodeId])

  const handleDelete = useCallback(() => {
    if (!selectedNodeId) return
    onDeleteNodeRef.current?.(selectedNodeId)
    setSelectedNodeId(null)
  }, [selectedNodeId])

  return (
    <div className={`graph-editor${compact ? ' graph-editor--compact' : ''}`}>
      <div ref={containerRef} className="graph-canvas">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
      {selectedNodeId && onDeleteNode && (
        <button className="btn-delete" onClick={handleDelete} title="Presioná para eliminar el nodo seleccionado">
          Eliminar seleccionado
        </button>
      )}
    </div>
  )
})
