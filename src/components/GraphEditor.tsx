import { useRef, useEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import { Network } from 'vis-network'
import { DataSet } from 'vis-data'
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

const DEFAULT_EDGE_COLOR = '#334155'
const HIGHLIGHT_COLOR = '#16a34a'
const NODE_CYAN = '#06B6D4'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getNodeRadius = (label: string, viewportScale: number, nodeCount: number) => {
  const length = label.trim().length
  const densityScale = nodeCount >= 14 ? 0.82 : nodeCount >= 10 ? 0.88 : nodeCount >= 6 ? 0.94 : 1
  const baseRadius = length <= 1 ? 24 : length <= 2 ? 28 : length <= 4 ? 32 : 38
  return clamp(Math.round(baseRadius * viewportScale * densityScale), 20, 42)
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

export default forwardRef<GraphEditorHandle, Props>(function GraphEditor({ nodes, edges, directed, highlightEdges, highlightNodes, onDeleteNode, onDeleteEdge, onEdgeClick, onCanvasClick, compact, editable, onNodeDragEnd, theme, stepType }: Props, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const nodesDataSet = useRef(new DataSet<Record<string, unknown>>())
  const edgesDataSet = useRef(new DataSet<Record<string, unknown>>())
  const [viewportScale, setViewportScale] = useState(0.9)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const onEdgeClickRef = useRef(onEdgeClick)
  onEdgeClickRef.current = onEdgeClick
  
  const onNodeDragEndRef = useRef(onNodeDragEnd)
  onNodeDragEndRef.current = onNodeDragEnd

  useImperativeHandle(ref, () => ({
    exportImage: () => {
      const container = containerRef.current
      if (!container) return null
      const canvas = container.querySelector('canvas')
      if (!canvas) return null
      return canvas.toDataURL('image/png')
    },
    getContainer: () => containerRef.current,
  }))

  // Initialize network once
  useEffect(() => {
    if (!containerRef.current) return

    const renderCircleNode = ({ ctx, x, y, state, style, label }: {
      ctx: CanvasRenderingContext2D
      x: number
      y: number
      state: { selected: boolean; hover: boolean }
      style: { size: number; backgroundColor?: string; borderColor?: string; borderWidth?: number }
      label: string
    }) => {
      const radius = style.size
      const labelText = String(label || '').trim()
      const labelLength = labelText.length
      const background = state.selected
        ? '#0369A1'
        : state.hover
          ? '#0284C7'
          : (style.backgroundColor || NODE_CYAN)
      const border = state.selected
        ? '#E0F2FE'
        : state.hover
          ? '#BAE6FD'
          : (style.borderColor || NODE_CYAN)
      const borderWidth = state.selected ? (style.borderWidth ?? 2) + 2 : style.borderWidth ?? 2
      const fontSize = labelLength <= 1
        ? Math.max(20, Math.round(radius * 0.88))
        : labelLength <= 2
          ? Math.max(17, Math.round(radius * 0.75))
          : labelLength <= 4
            ? Math.max(15, Math.round(radius * 0.62))
            : Math.max(14, Math.round(radius * 0.55))

      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fillStyle = background
      ctx.fill()
      ctx.lineWidth = borderWidth
      ctx.strokeStyle = border
      ctx.stroke()

      ctx.fillStyle = '#FFFFFF'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `${labelLength <= 1 ? 700 : 600} ${fontSize}px Arial`

      const textLines = String(label || '').split('\n')
      const lineHeight = fontSize + 2
      const totalHeight = (textLines.length - 1) * lineHeight
      const visualOffset = Math.max(1, Math.round(fontSize * 0.08))

      textLines.forEach((line, index) => {
        ctx.fillText(line, x, y + visualOffset - totalHeight / 2 + index * lineHeight)
      })

      ctx.restore()

      return {
        drawNode() {},
        nodeDimensions: { width: radius * 2 + borderWidth * 2, height: radius * 2 + borderWidth * 2 },
      }
    }

    const options = {
      physics: { enabled: false },
      edges: {
        font: { size: 15, color: '#F8FAFC', align: 'middle' as const, background: '#1E293B', strokeWidth: 3, strokeColor: '#1E293B' },
        width: 3,
        color: { color: DEFAULT_EDGE_COLOR, highlight: DEFAULT_EDGE_COLOR },
        arrows: { to: { enabled: false, scaleFactor: 0.65 } },
        arrowStrikethrough: false,
        smooth: { enabled: true, type: 'continuous', roundness: 0.5 },
      },
      nodes: {
        shape: 'custom' as const,
        ctxRenderer: renderCircleNode,
        borderWidth: 2,
        color: {
          background: NODE_CYAN,
          border: NODE_CYAN,
          hover: { background: '#0284C7', border: '#BAE6FD' },
          highlight: { background: '#0369A1', border: '#E0F2FE' },
        },
        size: 36,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
        chosen: false,
        shadow: {
          enabled: true,
          color: 'rgba(15, 23, 42, 0.28)',
          size: 8,
          x: 0,
          y: 4,
        },
      },
      interaction: {
        hover: true,
        selectConnectedEdges: false,
      },
      manipulation: false,
      layout: { improvedLayout: false },
    }

    networkRef.current = new Network(containerRef.current, { nodes: nodesDataSet.current, edges: edgesDataSet.current }, options)

    const updateViewportScale = () => {
      const element = containerRef.current
      if (!element) return
      const width = element.clientWidth || 800
      const height = element.clientHeight || 360
      const nextScale = clamp(Math.min(width / 900, height / 360), 0.82, 0.98)
      setViewportScale(nextScale)
    }

    updateViewportScale()

    const resizeObserver = new ResizeObserver(updateViewportScale)
    resizeObserver.observe(containerRef.current)

    networkRef.current.on('click', (params) => {
      if (params.nodes.length > 0) {
        setSelectedNodeId(String(params.nodes[0]))
      } else {
        setSelectedNodeId(null)
      }

      if (params.edges.length > 0) {
        if (!onEdgeClickRef.current) return
        const edgeId = String(params.edges[0])
        const edge = edgesDataSet.current.get(edgeId) as { from: string; to: string; label?: string } | null
        if (edge) {
          onEdgeClickRef.current(edge.from, edge.to, parseFloat(edge.label || '0'))
        }
      } else if (params.nodes.length === 0) {
        onCanvasClick?.()
      }
    })

    networkRef.current.on('deselectEdge', () => {
      onCanvasClick?.()
    })

    networkRef.current.on('deselectNode', () => {
      setSelectedNodeId(null)
    })

    networkRef.current.on('dragEnd', (params) => {
      if (params.nodes.length > 0) {
        const nodeId = String(params.nodes[0])
        const pos = networkRef.current?.getPosition(nodeId)
        if (pos && onNodeDragEndRef.current) {
          onNodeDragEndRef.current(nodeId, pos.x, pos.y)
        }
      }
    })

    return () => {
      resizeObserver.disconnect()
      networkRef.current?.destroy()
      networkRef.current = null
    }
  }, [nodes.length, edges.length, directed, theme])

  // Update interaction options based on editable prop
  useEffect(() => {
    if (!networkRef.current) return
    const isEditable = editable !== false
    networkRef.current.setOptions({
      interaction: {
        dragNodes: isEditable,
        dragView: isEditable,
        zoomView: isEditable,
        selectable: isEditable,
        hover: isEditable,
      }
    })
  }, [editable])

  // Update edge font options when theme changes to fix light mode weight backgrounds
  useEffect(() => {
    if (!networkRef.current) return
    const isDark = theme === 'dark'
    const fontColor = isDark ? '#F8FAFC' : '#0F172A'
    const canvasBg = isDark ? '#0F172A' : '#F8FAFC' // Matches canvas background!
    
    networkRef.current.setOptions({
      edges: {
        font: {
          size: 15,
          color: fontColor,
          align: 'middle' as const, // Centered on the line
          background: canvasBg, // Solid background to cut the line
          strokeWidth: 6, // 6px stroke halo for maximum legibility
          strokeColor: canvasBg
        }
      }
    })
  }, [theme])

  // Sync nodes and edges synchronously in a single effect to avoid race conditions and orphan labels
  useEffect(() => {
    // 1. Sync Nodes
    const count = nodes.length
    const positions = computeForceDirectedLayout(nodes.map(n => n.id), edges)

    const nodeItems = nodes.map((n, i) => {
      const radius = getNodeRadius(n.label, viewportScale, count)
      const labelLength = n.label.trim().length
      const fontSize = labelLength <= 1
        ? Math.max(20, Math.round(radius * 0.88))
        : labelLength <= 2
          ? Math.max(17, Math.round(radius * 0.75))
          : labelLength <= 4
            ? Math.max(15, Math.round(radius * 0.62))
            : Math.max(14, Math.round(radius * 0.55))

      return {
        id: n.id,
        label: n.label,
        size: radius,
        x: n.x !== undefined ? n.x : (positions[i]?.x ?? 0),
        y: n.y !== undefined ? n.y : (positions[i]?.y ?? 0),
        widthConstraint: { minimum: radius * 2, maximum: radius * 2 },
        heightConstraint: { minimum: radius * 2, valign: 'middle' },
        font: {
          size: fontSize,
          color: '#FFFFFF',
          face: 'Arial',
          bold: labelLength <= 1
        }
      }
    })

    // 2. Sync Edges
    const pairCounts = new Map<string, number>();
    edges.forEach((e) => {
      const pairKey = directed ? `${e.from}->${e.to}` : [e.from, e.to].sort().join('-');
      pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
    });

    const currentPairIdx = new Map<string, number>();
    const seenEdgesRender = new Set<string>();

    const edgeItems = edges
      .map((e, i) => {
        const fromNode = nodes.find(n => n.id === e.from);
        const toNode = nodes.find(n => n.id === e.to);
        if (!fromNode || !toNode || e.from === e.to) return null;

        const pairKey = directed ? `${e.from}->${e.to}` : [e.from, e.to].sort().join('-');
        
        if (seenEdgesRender.has(pairKey)) return null;
        seenEdgesRender.add(pairKey);

        const count = pairCounts.get(pairKey) || 1;
        const idx = currentPairIdx.get(pairKey) || 0;
        currentPairIdx.set(pairKey, idx + 1);

        let smoothOpt: any = { enabled: false };
        const hasReverse = directed && edges.some(other => other.from === e.to && other.to === e.from);
        
        if (count > 1 || hasReverse) {
          const step = idx % 2 === 0 ? 1 : -1;
          const roundVal = 0.18 + Math.floor(idx / 2) * 0.15;
          smoothOpt = {
            enabled: true,
            type: step > 0 ? 'curvedCW' : 'curvedCCW',
            roundness: roundVal
          };
        }

        const isDark = theme === 'dark';
        const fontColor = isDark ? '#F8FAFC' : '#0F172A';
        const canvasBg = isDark ? '#0F172A' : '#F8FAFC';

        return {
          id: `${e.from}-${e.to}-${i}`,
          from: e.from,
          to: e.to,
          label: String(e.weight),
          arrows: directed ? { to: { enabled: true, scaleFactor: 0.65 } } : undefined,
          smooth: smoothOpt,
          font: {
            size: 15,
            color: fontColor,
            align: 'middle',
            background: canvasBg,
            strokeWidth: 6,
            strokeColor: canvasBg
          }
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // Update datasets in a single transaction to prevent race conditions or blank frames
    nodesDataSet.current.clear()
    nodesDataSet.current.add(nodeItems as unknown as Record<string, unknown>[])
    edgesDataSet.current.clear()
    edgesDataSet.current.add(edgeItems as unknown as Record<string, unknown>[])
  }, [nodes, edges, directed, theme, viewportScale])

  // Highlight solution edges and nodes with semantic or custom colors
  useEffect(() => {
    if (!networkRef.current) return

    const defaultEdge = { color: { color: DEFAULT_EDGE_COLOR, highlight: DEFAULT_EDGE_COLOR }, width: 3 }

    // Determine highlighting colors based on stepType
    let edgeColor = HIGHLIGHT_COLOR; // Green (#16a34a)
    let nodeBg = '#166534'; // Dark green
    let nodeBorder = '#4ADE80'; // Light green

    if (stepType === 'reject') {
      edgeColor = '#ef4444'; // Red
      nodeBg = '#991b1b'; // Dark red
      nodeBorder = '#FCA5A5'; // Light red
    } else if (stepType === 'explore') {
      edgeColor = '#06b6d4'; // Cyan
      nodeBg = '#0e7490'; // Dark cyan
      nodeBorder = '#22d3ee'; // Light cyan
    }

    edgesDataSet.current.forEach((edge: Record<string, unknown>) => {
      const e = edge as unknown as { id: string }
      edgesDataSet.current.update({ id: e.id, ...defaultEdge } as unknown as Record<string, unknown>)
    })

    if (highlightEdges) {
      edgesDataSet.current.forEach((edge: Record<string, unknown>) => {
        const e = edge as unknown as { id: string; from: string; to: string }
        const key = `${e.from}->${e.to}`
        const reverseKey = `${e.to}->${e.from}`
        
        const found = highlightEdges.find((h: any) => {
          if (typeof h === 'string') {
            return h === key || h === reverseKey;
          } else {
            return h && (h.id === key || h.id === reverseKey);
          }
        });

        if (found) {
          const customColor = typeof found === 'object' ? found.color : edgeColor;
          const customEdgeOpt = { color: { color: customColor, highlight: customColor }, width: 5 }
          edgesDataSet.current.update({ id: e.id, ...customEdgeOpt } as unknown as Record<string, unknown>)
        }
      })
    }

    const defaultNode = { color: { background: NODE_CYAN, border: NODE_CYAN, highlight: { background: NODE_CYAN, border: '#F8FAFC' } } }

    nodesDataSet.current.forEach((node: Record<string, unknown>) => {
      const n = node as unknown as { id: string }
      nodesDataSet.current.update({ id: n.id, ...defaultNode } as unknown as Record<string, unknown>)
    })

    if (highlightNodes) {
      nodesDataSet.current.forEach((node: Record<string, unknown>) => {
        const n = node as unknown as { id: string }
        
        const found = highlightNodes.find((h: any) => {
          if (typeof h === 'string') {
            return h === n.id;
          } else {
            return h && h.id === n.id;
          }
        });

        if (found) {
          let customBg = nodeBg;
          let customBorder = nodeBorder;
          if (typeof found === 'object') {
            customBg = found.color;
            customBorder = found.border || found.color;
          }
          const customNodeOpt = { color: { background: customBg, border: customBorder, highlight: { background: customBg, border: customBorder } } }
          nodesDataSet.current.update({ id: n.id, ...customNodeOpt } as unknown as Record<string, unknown>)
        }
      })
    }
  }, [highlightEdges, highlightNodes, stepType])

  // Fit view on node count change (no animation)
  useEffect(() => {
    networkRef.current?.fit()
  }, [nodes.length])

  const handleDelete = useCallback(() => {
    if (!networkRef.current || !selectedNodeId) return
    networkRef.current.deleteSelected()
    onDeleteNode?.(selectedNodeId)
    setSelectedNodeId(null)
  }, [onDeleteNode, selectedNodeId])

  useEffect(() => {
    if (selectedNodeId && !nodes.some(node => node.id === selectedNodeId)) {
      setSelectedNodeId(null)
    }
  }, [nodes, selectedNodeId])

  return (
    <div className={`graph-editor${compact ? ' graph-editor--compact' : ''}`}>
      <div ref={containerRef} className="graph-canvas" />
      {selectedNodeId && onDeleteNode && (
        <button className="btn-delete" onClick={handleDelete} title="Presioná para eliminar el nodo seleccionado">
          Eliminar seleccionado
        </button>
      )}
    </div>
  )
})
