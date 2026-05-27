import { useState, useCallback, useMemo } from 'react'
import type { ProblemType, GraphNode, GraphEdge, ResultData } from './types'
import { graphToDot, parseDotResult, buildNodeOptions, PROBLEM_LABELS } from './utils'
import ProblemSelector from './components/ProblemSelector'
import GraphEditor from './components/GraphEditor'
import { Resolver } from '../core/Resolver'
import { DijkstraStrategyAlgorithm } from '../core/DijkstraStrategyAlgorithm'
import { KruskalStrategyAlgorithm } from '../core/KruskalStrategyAlgorithm'
import { PrimStrategyAlgorithm } from '../core/PrimStrategyAlgorithm'
import { MaxFlowStrategyAlgorithm } from '../core/MaxFlowStrategyAlgorithm'

const resolver = new Resolver()

export default function App() {
  const [problem, setProblem] = useState<ProblemType>('shortest-path')
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [startNode, setStartNode] = useState('')
  const [endNode, setEndNode] = useState('')
  const [result, setResult] = useState<ResultData | null>(null)
  const [resultEdges, setResultEdges] = useState<string[]>([])
  const [resultNodes, setResultNodes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  // Input fields
  const [newNodeName, setNewNodeName] = useState('')
  const [edgeFrom, setEdgeFrom] = useState('')
  const [edgeTo, setEdgeTo] = useState('')
  const [edgeWeight, setEdgeWeight] = useState('1')
  const [editingEdge, setEditingEdge] = useState<{ from: string; to: string } | null>(null)

  const directed = useMemo(() => problem === 'max-flow', [problem])

  const nodeOptions = useMemo(() => buildNodeOptions({ nodes, edges, directed }), [nodes, edges])

  const needsStartEnd = problem === 'shortest-path' || problem === 'max-flow'

  const handleAddNode = useCallback(() => {
    const name = newNodeName.trim()
    if (!name) return
    if (nodes.some(n => n.id === name)) {
      setError(`Ya existe un punto llamado "${name}"`)
      return
    }
    setNodes(prev => [...prev, { id: name, label: name }])
    setNewNodeName('')
    setError(null)
    setResult(null)
  }, [newNodeName, nodes])

  const handleAddEdge = useCallback(() => {
    const from = edgeFrom.trim()
    const to = edgeTo.trim()
    const weight = parseFloat(edgeWeight)
    if (!from || !to) return
    if (isNaN(weight) || weight <= 0) {
      setError('El peso/costo debe ser un número positivo')
      return
    }
    if (from === to) {
      setError('No se puede conectar un punto consigo mismo')
      return
    }

    if (editingEdge) {
      setEdges(prev =>
        prev.map(e =>
          e.from === editingEdge.from && e.to === editingEdge.to
            ? { from, to, weight }
            : e
        )
      )
      setEditingEdge(null)
    } else {
      setEdges(prev => [...prev, { from, to, weight }])
    }
    setEdgeFrom('')
    setEdgeTo('')
    setEdgeWeight('1')
    setError(null)
    setResult(null)
  }, [edgeFrom, edgeTo, edgeWeight, editingEdge])

  const handleDeleteNode = useCallback((id: string) => {
    setNodes(prev => prev.filter(n => n.id !== id))
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id))
    setResult(null)
  }, [])

  const handleDeleteEdge = useCallback((from: string, to: string) => {
    const idx = edges.findIndex(e => e.from === from && e.to === to)
    if (idx !== -1) {
      setEdges(prev => prev.filter((_, i) => i !== idx))
      if (editingEdge?.from === from && editingEdge?.to === to) {
        setEditingEdge(null)
        setEdgeFrom('')
        setEdgeTo('')
        setEdgeWeight('1')
      }
      setResult(null)
    }
  }, [edges, editingEdge])

  const handleEdgeClick = useCallback((from: string, to: string, weight: number) => {
    setEdgeFrom(from)
    setEdgeTo(to)
    setEdgeWeight(String(weight))
    setEditingEdge({ from, to })
    setError(null)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement
      if (target.id === 'node-input') handleAddNode()
      else if (target.id === 'edge-from' || target.id === 'edge-to' || target.id === 'edge-weight') handleAddEdge()
    }
  }, [handleAddNode, handleAddEdge])

  const handleRun = useCallback(() => {
    setError(null)
    setResult(null)
    setResultEdges([])
    setResultNodes([])

    if (nodes.length === 0) {
      setError('Primero agregá al menos un punto al mapa')
      return
    }
    if (edges.length === 0) {
      setError('Agregá al menos una conexión entre los puntos')
      return
    }
    if (needsStartEnd) {
      if (!startNode) {
        setError('Seleccioná el punto de origen')
        return
      }
      if (!endNode) {
        setError('Seleccioná el punto de destino')
        return
      }
      if (startNode === endNode) {
        setError('El origen y el destino deben ser distintos')
        return
      }
    }

    const dot = graphToDot({ nodes, edges, directed })

    try {
      switch (problem) {
        case 'shortest-path': {
          resolver.setStrategy(new DijkstraStrategyAlgorithm())
          const res = resolver.resolve(dot, startNode, endNode)
          const parsed = parseDotResult(res)
          setResultEdges(parsed.edges.map(e => `${e.from}->${e.to}`))
          const pathNodes = new Set<string>()
          parsed.edges.forEach(e => { pathNodes.add(e.from); pathNodes.add(e.to) })
          setResultNodes(Array.from(pathNodes))
          const steps = parsed.edges.map((e, i) => `${i + 1}. De "${e.from}" a "${e.to}" (costo: ${e.weight})`).join('\n')
          const total = parsed.edges.reduce((s, e) => s + e.weight, 0)
          setResult({
            title: 'Camino mas corto encontrado',
            body: `Para ir de "${startNode}" a "${endNode}" de la forma mas barata o rapida, segui esta ruta:\n\n${steps}`,
            total: `Costo total del viaje: ${total}`,
            note: 'Esta es la mejor ruta posible. Cualquier otro camino tendria un costo igual o mayor.',
          })
          break
        }
        case 'mst': {
          resolver.setStrategy(new KruskalStrategyAlgorithm())
          const res = resolver.resolve(dot)
          const parsed = parseDotResult(res)
          setResultEdges(parsed.edges.map(e => `${e.from}->${e.to}`))
          const totalWeight = parsed.edges.reduce((sum, e) => sum + e.weight, 0)
          const connections = parsed.edges.map((e, i) => `${i + 1}. "${e.from}" ↔ "${e.to}" (costo: ${e.weight})`).join('\n')
          setResult({
            title: 'Conexion optima encontrada',
            body: `Para conectar todos los puntos gastando lo menos posible, necesitas estas ${parsed.edges.length} conexiones:\n\n${connections}`,
            total: `Costo total de la obra: ${totalWeight}`,
            note: 'Con esta red todos los puntos quedan conectados con la menor inversion posible.',
          })
          break
        }
        case 'max-flow': {
          resolver.setStrategy(new MaxFlowStrategyAlgorithm())
          const res = resolver.resolve(dot, startNode, endNode)
          setResult({
            title: 'Flujo maximo calculado',
            body: `Desde "${startNode}" hasta "${endNode}" se puede transportar un total de ${res} unidades.`,
            total: `Flujo maximo: ${res}`,
            note: `Por mas que intentes, no podra pasar mas de ${res} unidades por esta red. Es el limite maximo que soportan las conexiones actuales.`,
          })
          break
        }
      }
    } catch (err) {
      setError(`Error al resolver: ${err instanceof Error ? err.message : 'desconocido'}`)
    }
  }, [problem, nodes, edges, startNode, endNode, directed, needsStartEnd])

  const handleReset = useCallback(() => {
    setNodes([])
    setEdges([])
    setStartNode('')
    setEndNode('')
    setResult(null)
    setResultEdges([])
    setResultNodes([])
    setError(null)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Optimizador de Redes</h1>
        <p className="subtitle">Armá tu mapa y dejanos buscar la mejor solución</p>
      </header>

      <ProblemSelector value={problem} onChange={(p) => { setProblem(p); setResult(null); setResultEdges([]); setResultNodes([]); setError(null) }} />

      <div className="main-layout">
        <div className="panel graph-panel">
          <GraphEditor
            nodes={nodes}
            edges={edges}
            directed={directed}
            highlightEdges={resultEdges}
            highlightNodes={resultNodes}
            onDeleteNode={handleDeleteNode}
            onDeleteEdge={handleDeleteEdge}
            onEdgeClick={handleEdgeClick}
          />

          <div className="graph-inputs">
            <div className="input-section">
              <h4>Agregar punto</h4>
              <div className="input-row">
                <input
                  id="node-input"
                  type="text"
                  placeholder="Nombre del punto (ej: A)"
                  value={newNodeName}
                  onChange={e => setNewNodeName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={20}
                />
                <button onClick={handleAddNode}>Añadir</button>
              </div>
            </div>

            <div className="input-section">
              <h4>{editingEdge ? 'Editar conexión' : 'Agregar conexión'}</h4>
              <div className="input-row">
                <input
                  id="edge-from"
                  type="text"
                  placeholder="Desde"
                  value={edgeFrom}
                  onChange={e => setEdgeFrom(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={20}
                  list="nodes-list"
                />
                <span className="arrow">{directed ? '→' : '↔'}</span>
                <input
                  id="edge-to"
                  type="text"
                  placeholder="Hasta"
                  value={edgeTo}
                  onChange={e => setEdgeTo(e.target.value)}
                  onKeyDown={handleKeyDown}
                  maxLength={20}
                  list="nodes-list"
                />
                <input
                  id="edge-weight"
                  type="number"
                  placeholder="Peso"
                  value={edgeWeight}
                  onChange={e => setEdgeWeight(e.target.value)}
                  onKeyDown={handleKeyDown}
                  min="0.1"
                  step="any"
                  className="weight-input"
                />
                <button onClick={handleAddEdge}>{editingEdge ? 'Actualizar' : 'Añadir'}</button>
                {editingEdge && (
                  <button className="btn-cancel" onClick={() => { setEditingEdge(null); setEdgeFrom(''); setEdgeTo(''); setEdgeWeight('1') }}>
                    ✕
                  </button>
                )}
              </div>
              <datalist id="nodes-list">
                {nodeOptions.map(o => <option key={o.value} value={o.value} />)}
              </datalist>
              {editingEdge && (
                <p className="edit-hint">Conectaste "{editingEdge.from}" → "{editingEdge.to}". Cambiá los valores y presioná Actualizar.</p>
              )}
            </div>
          </div>
        </div>

        <div className="panel controls-panel">
          {needsStartEnd && (
            <div className="params-section">
              <h4>Puntos de inicio y fin</h4>
              <div className="param-row">
                <label>Origen</label>
                <select value={startNode} onChange={e => setStartNode(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {nodeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="param-row">
                <label>Destino</label>
                <select value={endNode} onChange={e => setEndNode(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {nodeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          )}

          <button className="btn-run" onClick={handleRun}>
            Resolver
          </button>

          <button className="btn-reset" onClick={handleReset}>
            Empezar de nuevo
          </button>

          {error && (
            <div className="result error">
              <strong>{error}</strong>
            </div>
          )}

          {result && (
            <div className="result-card">
              <div className="result-card-header">
                <h3>{result.title}</h3>
              </div>
              <div className="result-card-body">
                <p>{result.body}</p>
              </div>
              {result.total && (
                <div className="result-card-total">
                  {result.total}
                </div>
              )}
              <div className="result-card-footer">
                <p>{result.note}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
