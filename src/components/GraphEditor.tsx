import { useRef, useEffect, useCallback, useState } from 'react'
import { Network } from 'vis-network'
import { DataSet } from 'vis-data'
import type { GraphNode, GraphEdge } from '../types'

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

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  directed: boolean
  highlightEdges?: string[]
  highlightNodes?: string[]
  onDeleteNode?: (id: string) => void
  onDeleteEdge?: (from: string, to: string) => void
  onEdgeClick?: (from: string, to: string, weight: number) => void
  onCanvasClick?: () => void
}

export default function GraphEditor({ nodes, edges, directed, highlightEdges, highlightNodes, onDeleteNode, onDeleteEdge, onEdgeClick, onCanvasClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const nodesDataSet = useRef(new DataSet<Record<string, unknown>>())
  const edgesDataSet = useRef(new DataSet<Record<string, unknown>>())
  const [viewportScale, setViewportScale] = useState(0.9)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const onEdgeClickRef = useRef(onEdgeClick)
  onEdgeClickRef.current = onEdgeClick

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
      physics: { enabled: true, solver: 'forceAtlas2Based', stabilization: { iterations: 100 } },
      edges: {
        font: { size: 15, color: '#E0F2FE', align: 'middle' as const, background: '#0F172A', strokeWidth: 3, strokeColor: '#0F172A' },
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

    return () => {
      resizeObserver.disconnect()
      networkRef.current?.destroy()
      networkRef.current = null
    }
  }, [])

  // Sync nodes
  useEffect(() => {
    const items = nodes.map(n => {
      const radius = getNodeRadius(n.label, viewportScale, nodes.length)
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
    nodesDataSet.current.clear()
    nodesDataSet.current.add(items as unknown as Record<string, unknown>[])
  }, [nodes, viewportScale])

  // Sync edges
  useEffect(() => {
    const items = edges.map((e, i) => ({
      id: `${e.from}-${e.to}-${i}`,
      from: e.from,
      to: e.to,
      label: String(e.weight),
      arrows: directed ? { to: { enabled: true, scaleFactor: 0.65 } } : undefined,
    }))
    edgesDataSet.current.clear()
    edgesDataSet.current.add(items as unknown as Record<string, unknown>[])
  }, [edges, directed])

  // Highlight solution edges and nodes in green
  useEffect(() => {
    if (!networkRef.current) return

    const defaultEdge = { color: { color: DEFAULT_EDGE_COLOR, highlight: DEFAULT_EDGE_COLOR }, width: 3 }
    const highlightedEdge = { color: { color: HIGHLIGHT_COLOR, highlight: HIGHLIGHT_COLOR }, width: 5 }

    edgesDataSet.current.forEach((edge: Record<string, unknown>) => {
      const e = edge as unknown as { id: string }
      edgesDataSet.current.update({ id: e.id, ...defaultEdge } as unknown as Record<string, unknown>)
    })

    if (highlightEdges) {
      edgesDataSet.current.forEach((edge: Record<string, unknown>) => {
        const e = edge as unknown as { id: string; from: string; to: string }
        const key = `${e.from}->${e.to}`
        const reverseKey = `${e.to}->${e.from}`
        if (highlightEdges.includes(key) || highlightEdges.includes(reverseKey)) {
          edgesDataSet.current.update({ id: e.id, ...highlightedEdge } as unknown as Record<string, unknown>)
        }
      })
    }

    const defaultNode = { color: { background: NODE_CYAN, border: NODE_CYAN, highlight: { background: NODE_CYAN, border: '#F8FAFC' } } }
    const highlightedNode = { color: { background: '#166534', border: '#4ADE80', highlight: { background: '#166534', border: '#4ADE80' } } }

    nodesDataSet.current.forEach((node: Record<string, unknown>) => {
      const n = node as unknown as { id: string }
      nodesDataSet.current.update({ id: n.id, ...defaultNode } as unknown as Record<string, unknown>)
    })

    if (highlightNodes) {
      nodesDataSet.current.forEach((node: Record<string, unknown>) => {
        const n = node as unknown as { id: string }
        if (highlightNodes.includes(n.id)) {
          nodesDataSet.current.update({ id: n.id, ...highlightedNode } as unknown as Record<string, unknown>)
        }
      })
    }
  }, [highlightEdges, highlightNodes])

  // Fit view on data change
  useEffect(() => {
    networkRef.current?.fit({ animation: true })
  }, [nodes.length, edges.length])

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
    <div className="graph-editor">
      <div ref={containerRef} className="graph-canvas" />
      {selectedNodeId && (
        <button className="btn-delete" onClick={handleDelete} title="Presioná para eliminar el nodo seleccionado">
          Eliminar seleccionado
        </button>
      )}
    </div>
  )
}
