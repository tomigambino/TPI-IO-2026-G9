import { useRef, useEffect, useCallback } from 'react'
import { Network } from 'vis-network'
import { DataSet } from 'vis-data'
import type { GraphNode, GraphEdge } from '../types'

const DEFAULT_EDGE_COLOR = '#334155'
const HIGHLIGHT_COLOR = '#16a34a'
const NODE_CYAN = '#06B6D4'

interface Props {
  nodes: GraphNode[]
  edges: GraphEdge[]
  directed: boolean
  highlightEdges?: string[]
  highlightNodes?: string[]
  onDeleteNode?: (id: string) => void
  onDeleteEdge?: (from: string, to: string) => void
  onEdgeClick?: (from: string, to: string, weight: number) => void
}

export default function GraphEditor({ nodes, edges, directed, highlightEdges, highlightNodes, onDeleteNode, onDeleteEdge, onEdgeClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const networkRef = useRef<Network | null>(null)
  const nodesDataSet = useRef(new DataSet<Record<string, unknown>>())
  const edgesDataSet = useRef(new DataSet<Record<string, unknown>>())
  const onEdgeClickRef = useRef(onEdgeClick)
  onEdgeClickRef.current = onEdgeClick

  // Initialize network once
  useEffect(() => {
    if (!containerRef.current) return

    const options = {
      physics: { enabled: true, solver: 'forceAtlas2Based', stabilization: { iterations: 100 } },
      edges: {
        font: { size: 13, color: '#06B6D4', align: 'middle' as const, background: '#1E293B', strokeWidth: 0 },
        width: 2,
        color: { color: DEFAULT_EDGE_COLOR, highlight: DEFAULT_EDGE_COLOR },
        arrows: { to: { enabled: false } },
        smooth: { enabled: true, type: 'continuous', roundness: 0.5 },
      },
      nodes: {
        font: { size: 16, color: '#F8FAFC', face: 'Arial', strokeWidth: 0 },
        borderWidth: 2,
        color: {
          background: NODE_CYAN,
          border: NODE_CYAN,
          highlight: { background: '#06B6D4', border: '#F8FAFC' },
        },
        shape: 'ellipse' as const,
        size: 35,
        margin: { top: 8, right: 8, bottom: 8, left: 8 },
      },
      interaction: {
        hover: true,
        selectConnectedEdges: true,
      },
      manipulation: false,
    }

    networkRef.current = new Network(containerRef.current, { nodes: nodesDataSet.current, edges: edgesDataSet.current }, options)

    networkRef.current.on('click', (params) => {
      if (!onEdgeClickRef.current) return
      if (params.edges.length > 0) {
        const edgeId = String(params.edges[0])
        const edge = edgesDataSet.current.get(edgeId) as { from: string; to: string; label?: string } | null
        if (edge) {
          onEdgeClickRef.current(edge.from, edge.to, parseFloat(edge.label || '0'))
        }
      }
    })

    return () => {
      networkRef.current?.destroy()
      networkRef.current = null
    }
  }, [])

  // Sync nodes
  useEffect(() => {
    const items = nodes.map(n => ({
      id: n.id,
      label: n.label,
    }))
    nodesDataSet.current.clear()
    nodesDataSet.current.add(items as unknown as Record<string, unknown>[])
  }, [nodes])

  // Sync edges
  useEffect(() => {
    const items = edges.map((e, i) => ({
      id: `${e.from}-${e.to}-${i}`,
      from: e.from,
      to: e.to,
      label: String(e.weight),
      arrows: directed ? { to: { enabled: true } } : undefined,
    }))
    edgesDataSet.current.clear()
    edgesDataSet.current.add(items as unknown as Record<string, unknown>[])
  }, [edges, directed])

  // Highlight solution edges and nodes in green
  useEffect(() => {
    if (!networkRef.current) return

    const defaultEdge = { color: { color: DEFAULT_EDGE_COLOR, highlight: DEFAULT_EDGE_COLOR }, width: 2 }
    const highlightedEdge = { color: { color: HIGHLIGHT_COLOR, highlight: HIGHLIGHT_COLOR }, width: 4 }

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
    if (!networkRef.current) return
    const selNodes = networkRef.current.getSelectedNodes()
    const selEdges = networkRef.current.getSelectedEdges()

    if (selNodes.length > 0) {
      const id = String(selNodes[0])
      networkRef.current.deleteSelected()
      onDeleteNode?.(id)
    } else if (selEdges.length > 0) {
      const edgeId = String(selEdges[0])
      const edge = edgesDataSet.current.get(edgeId) as unknown as { from: string; to: string } | null
      if (edge) {
        networkRef.current.deleteSelected()
        onDeleteEdge?.(edge.from, edge.to)
      }
    }
  }, [onDeleteNode, onDeleteEdge])

  return (
    <div className="graph-editor">
      <div ref={containerRef} className="graph-canvas" />
      <button className="btn-delete" onClick={handleDelete} title="Seleccioná un nodo o conexión y presioná Eliminar">
        Eliminar seleccionado
      </button>
    </div>
  )
}
