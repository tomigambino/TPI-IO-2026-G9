import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { ProblemType, GraphNode, GraphEdge, ResultData } from './types'
import type { AlgorithmStep } from '../core/interfaces/step.interface'
import type { GraphEditorHandle } from './components/GraphEditor'
import { graphToDot, parseDotResult, buildNodeOptions, PROBLEM_LABELS, generateRandomGraph } from './utils'
import ProblemSelector from './components/ProblemSelector'
import GraphEditor from './components/GraphEditor'
import ConfirmationModal from './components/ConfirmationModal'
import AnimationControls from './components/AnimationControls'
import { Resolver } from '../core/Resolver'
import { DijkstraStrategyAlgorithm } from '../core/DijkstraStrategyAlgorithm'
import { KruskalStrategyAlgorithm } from '../core/KruskalStrategyAlgorithm'
import { PrimStrategyAlgorithm } from '../core/PrimStrategyAlgorithm'
import { MaxFlowStrategyAlgorithm } from '../core/MaxFlowStrategyAlgorithm'

const resolver = new Resolver()
const MAX_UNDO = 50

type GraphSnapshot = { nodes: GraphNode[]; edges: GraphEdge[] }

export default function App() {
  const [problem, setProblem] = useState<ProblemType>('shortest-path')
  const [nodes, setNodes] = useState<GraphNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [startNode, setStartNode] = useState('')
  const [endNode, setEndNode] = useState('')
  const [result, setResult] = useState<ResultData | null>(null)
  const [resultEdges, setResultEdges] = useState<string[]>([])
  const [resultNodes, setResultNodes] = useState<string[]>([])
  const [stepEdges, setStepEdges] = useState<string[]>([])
  const [stepNodes, setStepNodes] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)

  // Theme state
  const getInitialTheme = () => localStorage.getItem('theme') === 'light' ? 'light' : 'dark'
  const [theme, setTheme] = useState<'dark' | 'light'>(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark')
  }, [])

  // Undo / Redo state
  const [undoStack, setUndoStack] = useState<GraphSnapshot[]>([])
  const [redoStack, setRedoStack] = useState<GraphSnapshot[]>([])

  // Animation state
  const [steps, setSteps] = useState<AlgorithmStep[]>([])
  const [currentStepIdx, setCurrentStepIdx] = useState(-1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playSpeed, setPlaySpeed] = useState(800)
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const graphEditorRef = useRef<GraphEditorHandle>(null)
  const graphStepRef = useRef<GraphEditorHandle>(null)
  const [nodeCountInput, setNodeCountInput] = useState('5')
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Input fields
  const [newNodeName, setNewNodeName] = useState('')
  const [edgeFrom, setEdgeFrom] = useState('')
  const [edgeTo, setEdgeTo] = useState('')
  const [edgeWeight, setEdgeWeight] = useState('')
  const [selectedEdge, setSelectedEdge] = useState<{ originalFrom: string; originalTo: string; from: string; to: string; weight: string } | null>(null)

  const directed = useMemo(() => problem === 'max-flow', [problem])

  const nodeOptions = useMemo(() => buildNodeOptions({ nodes, edges, directed }), [nodes, edges])

  const needsStartEnd = problem === 'shortest-path' || problem === 'max-flow'

  const clearAnimation = useCallback(() => {
    setIsPlaying(false)
    setSteps([])
    setCurrentStepIdx(-1)
  }, [])

  // Capture current graph state for undo
  const pushUndo = useCallback(() => {
    setUndoStack(prev => {
      const next = [...prev, { nodes: nodes.map(n => ({ ...n })), edges: edges.map(e => ({ ...e })) }]
      if (next.length > MAX_UNDO) next.shift()
      return next
    })
    setRedoStack([])
  }, [nodes, edges])

  // Undo / Redo handlers
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return
    const prev = undoStack[undoStack.length - 1]
    setRedoStack(prevStack => [...prevStack, { nodes: nodes.map(n => ({ ...n })), edges: edges.map(e => ({ ...e })) }])
    setUndoStack(prev => prev.slice(0, -1))
    setNodes(prev.nodes)
    setEdges(prev.edges)
    setResult(null)
    setError(null)
    clearAnimation()
  }, [undoStack, nodes, edges, clearAnimation])

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return
    const next = redoStack[redoStack.length - 1]
    setUndoStack(prev => [...prev, { nodes: nodes.map(n => ({ ...n })), edges: edges.map(e => ({ ...e })) }])
    setRedoStack(prev => prev.slice(0, -1))
    setNodes(next.nodes)
    setEdges(next.edges)
    setResult(null)
    setError(null)
    clearAnimation()
  }, [redoStack, nodes, edges, clearAnimation])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' && e.shiftKey || e.key === 'y')) {
        e.preventDefault()
        handleRedo()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleUndo, handleRedo])

  // Cleanup play timer
  useEffect(() => {
    return () => {
      if (playTimerRef.current) clearInterval(playTimerRef.current)
    }
  }, [])

  // Play timer effect
  useEffect(() => {
    if (isPlaying) {
      playTimerRef.current = setInterval(() => {
        setCurrentStepIdx(prev => {
          if (prev >= steps.length - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, playSpeed)
    } else {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current)
        playTimerRef.current = null
      }
    }
    return () => {
      if (playTimerRef.current) {
        clearInterval(playTimerRef.current)
        playTimerRef.current = null
      }
    }
  }, [isPlaying, playSpeed, steps.length])

  // Update step-specific highlights for mini graph
  useEffect(() => {
    if (currentStepIdx >= 0 && currentStepIdx < steps.length) {
      const step = steps[currentStepIdx]
      setStepEdges(step.highlightEdges)
      setStepNodes(step.highlightNodes)
    }
  }, [currentStepIdx, steps])

  const handleAddNode = useCallback(() => {
    const name = newNodeName.trim()
    if (!name) return
    if (nodes.some(n => n.id === name)) {
      setError(`Ya existe un punto llamado "${name}"`)
      return
    }
    pushUndo()
    setNodes(prev => [...prev, { id: name, label: name }])
    setNewNodeName('')
    setError(null)
    setResult(null)
    clearAnimation()
  }, [newNodeName, nodes, pushUndo, clearAnimation])

  const handleAddEdge = useCallback(() => {
    const from = edgeFrom.trim()
    const to = edgeTo.trim()
    const weight = parseFloat(edgeWeight)
    if (!from || !to) return
    if (isNaN(weight) || weight <= 0) {
      setError('El costo debe ser un número positivo')
      return
    }
    if (from === to) {
      setError('No se puede conectar un punto consigo mismo')
      return
    }
    pushUndo()
    setEdges(prev => [...prev, { from, to, weight }])
    setEdgeFrom('')
    setEdgeTo('')
    setEdgeWeight('')
    setError(null)
    setResult(null)
    clearAnimation()
    document.getElementById('edge-from')?.focus()
  }, [edgeFrom, edgeTo, edgeWeight, pushUndo, clearAnimation])

  const handleDeleteNode = useCallback((id: string) => {
    pushUndo()
    setNodes(prev => prev.filter(n => n.id !== id))
    setEdges(prev => prev.filter(e => e.from !== id && e.to !== id))
    setResult(null)
    clearAnimation()
  }, [pushUndo, clearAnimation])

  const handleDeleteEdge = useCallback((from: string, to: string) => {
    const idx = edges.findIndex(e => e.from === from && e.to === to)
    if (idx !== -1) {
      pushUndo()
      setEdges(prev => prev.filter((_, i) => i !== idx))
      if (selectedEdge?.originalFrom === from && selectedEdge?.originalTo === to) {
        setSelectedEdge(null)
      }
      setResult(null)
      clearAnimation()
    }
  }, [edges, selectedEdge, pushUndo, clearAnimation])

  const handleEdgeClick = useCallback((from: string, to: string, weight: number) => {
    setSelectedEdge({
      originalFrom: from,
      originalTo: to,
      from,
      to,
      weight: String(weight),
    })
    setError(null)
  }, [])

  const handleClearSelectedEdge = useCallback(() => {
    setSelectedEdge(null)
  }, [])

  const handleExportImage = useCallback(() => {
    const dataUrl = graphEditorRef.current?.exportImage()
    if (!dataUrl) return
    const link = document.createElement('a')
    link.download = 'grafo.png'
    link.href = dataUrl
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [])

  const handleGenerateGraph = useCallback(() => {
    const count = Math.max(2, Math.min(15, Number(nodeCountInput) || 2))
    const graph = generateRandomGraph(count)
    pushUndo()
    setNodes(graph.nodes)
    setEdges(graph.edges)
    setStartNode('')
    setEndNode('')
    setResult(null)
    setError(null)
    setStepEdges([])
    setStepNodes([])
    clearAnimation()
    setSuccessMessage(`Grafo aleatorio generado con ${count} nodos`)
    setTimeout(() => setSuccessMessage(null), 3500)
  }, [nodeCountInput, pushUndo, clearAnimation])

  const edgeNodeSuggestions = useMemo(() => {
    const query = edgeFrom.trim().toLowerCase()
    return nodeOptions.filter(option => option.value.toLowerCase().includes(query)).slice(0, 6)
  }, [edgeFrom, nodeOptions])

  const edgeToSuggestions = useMemo(() => {
    const query = edgeTo.trim().toLowerCase()
    return nodeOptions.filter(option => option.value.toLowerCase().includes(query)).slice(0, 6)
  }, [edgeTo, nodeOptions])

  const handleUpdateSelectedEdge = useCallback(() => {
    if (!selectedEdge) return

    const from = selectedEdge.from.trim()
    const to = selectedEdge.to.trim()
    const weight = parseFloat(selectedEdge.weight)

    if (!from || !to) return
    if (isNaN(weight) || weight <= 0) {
      setError('El costo debe ser un número positivo')
      return
    }
    if (from === to) {
      setError('No se puede conectar un punto consigo mismo')
      return
    }
    pushUndo()
    setEdges(prev =>
      prev.map(e =>
        e.from === selectedEdge.originalFrom && e.to === selectedEdge.originalTo
          ? { from, to, weight }
          : e
      )
    )
    setSelectedEdge({
      originalFrom: from,
      originalTo: to,
      from,
      to,
      weight: String(weight),
    })
    setError(null)
    setResult(null)
    clearAnimation()
  }, [selectedEdge, pushUndo, clearAnimation])

  const handleDeleteSelectedEdge = useCallback(() => {
    if (!selectedEdge) return
    const { originalFrom, originalTo } = selectedEdge
    pushUndo()
    setEdges(prev => prev.filter(e => !(e.from === originalFrom && e.to === originalTo)))
    setSelectedEdge(null)
    setResult(null)
    clearAnimation()
  }, [selectedEdge, pushUndo, clearAnimation])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement
      if (target.id === 'node-input') {
        handleAddNode()
      } else if (target.id === 'edge-from') {
        e.preventDefault()
        document.getElementById('edge-to')?.focus()
      } else if (target.id === 'edge-to') {
        e.preventDefault()
        document.getElementById('edge-weight')?.focus()
      } else if (target.id === 'edge-weight') {
        e.preventDefault()
        handleAddEdge()
      }
    }
  }, [handleAddNode, handleAddEdge])

  const handleRun = useCallback(() => {
    setError(null)
    setResult(null)
    setResultEdges([])
    setResultNodes([])
    setStepEdges([])
    setStepNodes([])
    clearAnimation()

    if (nodes.length < 2) {
      setError('Agregá al menos dos puntos al mapa')
      return
    }
    if (edges.length === 0) {
      setError('Agregá al menos una conexión entre los puntos')
      return
    }
    if (needsStartEnd) {
      if (!startNode && !endNode) {
        setError('Seleccioná los puntos de origen y destino')
        return
      }
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
          const algoSteps = resolver.getSteps()
          setSteps(algoSteps)
          setCurrentStepIdx(0)

          if (algoSteps.length > 0) {
            const last = algoSteps[algoSteps.length - 1]
            setResultEdges(last.highlightEdges)
            setResultNodes(last.highlightNodes)
            setStepEdges(algoSteps[0].highlightEdges)
            setStepNodes(algoSteps[0].highlightNodes)
          }

          const parsed = parseDotResult(res)
          const pathNodes = new Set<string>()
          parsed.edges.forEach(e => { pathNodes.add(e.from); pathNodes.add(e.to) })
          const stepTexts = parsed.edges.map((e, i) => `${i + 1}. De "${e.from}" a "${e.to}" (costo: ${e.weight})`).join('\n')
          const total = parsed.edges.reduce((s, e) => s + e.weight, 0)
          setResult({
            title: 'Camino más corto encontrado',
            body: `Para ir de "${startNode}" a "${endNode}" de la forma más barata o rápida, seguí esta ruta:\n\n${stepTexts}`,
            total: `Costo total del viaje: ${total}`,
            note: 'Esta es la mejor ruta posible. Cualquier otro camino tendrá un costo igual o mayor.',
          })
          break
        }
        case 'mst': {
          resolver.setStrategy(new KruskalStrategyAlgorithm())
          const res = resolver.resolve(dot)
          const algoSteps = resolver.getSteps()
          setSteps(algoSteps)
          setCurrentStepIdx(0)

          if (algoSteps.length > 0) {
            const last = algoSteps[algoSteps.length - 1]
            setResultEdges(last.highlightEdges)
            setResultNodes(last.highlightNodes)
            setStepEdges(algoSteps[0].highlightEdges)
            setStepNodes(algoSteps[0].highlightNodes)
          }

          const parsed = parseDotResult(res)
          const totalWeight = parsed.edges.reduce((sum, e) => sum + e.weight, 0)
          const connections = parsed.edges.map((e, i) => `${i + 1}. Unir "${e.from}" con "${e.to}" (costo: ${e.weight})`).join('\n')
          const isSingularConnection = parsed.edges.length === 1
          setResult({
            title: 'Conexión óptima encontrada',
            body: isSingularConnection
              ? `Para unir todos los puntos usando la menor cantidad de recursos, necesitas la siguiente conexión:\n\n${connections}`
              : `Para unir todos los puntos usando la menor cantidad de recursos, necesitas las siguientes ${parsed.edges.length} conexiones:\n\n${connections}`,
            total: `Costo total: ${totalWeight}`,
            note: 'Con esta red todos los puntos quedan conectados con la menor inversión posible.',
          })
          break
        }
        case 'max-flow': {
          resolver.setStrategy(new MaxFlowStrategyAlgorithm())
          const res = resolver.resolve(dot, startNode, endNode)
          const algoSteps = resolver.getSteps()
          setSteps(algoSteps)
          setCurrentStepIdx(0)

          if (algoSteps.length > 0) {
            const last = algoSteps[algoSteps.length - 1]
            setResultEdges(last.highlightEdges)
            setResultNodes(last.highlightNodes)
            setStepEdges(algoSteps[0].highlightEdges)
            setStepNodes(algoSteps[0].highlightNodes)
          }

          const isSingularUnit = Number(res) === 1
          setResult({
            title: 'Flujo máximo calculado',
            body: isSingularUnit
              ? `Desde "${startNode}" hasta "${endNode}" se puede transportar exactamente 1 unidad.`
              : `Desde "${startNode}" hasta "${endNode}" se puede transportar un total de ${res} unidades.`,
            total: `Flujo máximo: ${res}`,
            note: isSingularUnit
              ? `Por más que intentes, no podrá pasar más de 1 unidad por esta red. Es el límite máximo que soportan las conexiones actuales.`
              : `Por más que intentes, no podrá pasar más de ${res} unidades por esta red. Es el límite máximo que soportan las conexiones actuales.`,
          })
          break
        }
      }
    } catch (err) {
      setError(`Error al resolver: ${err instanceof Error ? err.message : 'desconocido'}`)
    }
  }, [problem, nodes, edges, startNode, endNode, directed, needsStartEnd, clearAnimation])

  const handleReset = useCallback(() => {
    setNodes([])
    setEdges([])
    setStartNode('')
    setEndNode('')
    setResult(null)
    setResultEdges([])
    setResultNodes([])
    setStepEdges([])
    setStepNodes([])
    setError(null)
    clearAnimation()
  }, [clearAnimation])

  const handleConfirmReset = useCallback(() => {
    handleReset()
    setUndoStack([])
    setRedoStack([])
    setIsResetModalOpen(false)
  }, [handleReset])

  const handleStepChange = useCallback((step: number) => {
    setCurrentStepIdx(step)
  }, [])

  const handlePlayToggle = useCallback(() => {
    setIsPlaying(prev => !prev)
  }, [])

  const handleSpeedChange = useCallback((speed: number) => {
    setPlaySpeed(speed)
  }, [])

  const handleCloseAnimation = useCallback(() => {
    clearAnimation()
    setStepEdges([])
    setStepNodes([])
  }, [clearAnimation])

  const hasAnimation = steps.length > 0 && currentStepIdx >= 0

  return (
    <div className="app">
      <header className="app-header">
        <h1>Optimizador de Redes</h1>
        <button className="btn-theme" onClick={toggleTheme}>
          {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        </button>
        <p className="subtitle">Armá tu mapa y dejanos buscar la mejor solución</p>
      </header>

      <ProblemSelector value={problem} onChange={(p) => { setProblem(p); setResult(null); setResultEdges([]); setResultNodes([]); setError(null); clearAnimation() }} />

      <div className="main-layout">
        <div className="panel graph-panel">
          <GraphEditor
            ref={graphEditorRef}
            nodes={nodes}
            edges={edges}
            directed={directed}
            highlightEdges={resultEdges}
            highlightNodes={resultNodes}
            onDeleteNode={handleDeleteNode}
            onDeleteEdge={handleDeleteEdge}
            onEdgeClick={handleEdgeClick}
            onCanvasClick={handleClearSelectedEdge}
          />

          {hasAnimation && (
            <>
            <AnimationControls
              steps={steps}
              currentStep={currentStepIdx}
              isPlaying={isPlaying}
              playSpeed={playSpeed}
              onStepChange={handleStepChange}
              onPlayToggle={handlePlayToggle}
              onSpeedChange={handleSpeedChange}
              onClose={handleCloseAnimation}
            />
            <GraphEditor
              ref={graphStepRef}
              nodes={nodes}
              edges={edges}
              directed={directed}
              highlightEdges={stepEdges}
              highlightNodes={stepNodes}
              compact
            />
            </>
          )}

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
              <h4>Agregar conexión</h4>
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
                  placeholder="Costo"
                  value={edgeWeight}
                  onChange={e => setEdgeWeight(e.target.value)}
                  onKeyDown={handleKeyDown}
                  min="0.1"
                  step="any"
                  className="weight-input"
                />
                <button onClick={handleAddEdge}>Añadir</button>
              </div>
              <datalist id="nodes-list">
                {nodeOptions.map(o => <option key={o.value} value={o.value} />)}
              </datalist>
            </div>

            {selectedEdge && (
              <div className="input-section edge-edit-section">
                <h4>Editar / eliminar conexión seleccionada</h4>
                <div className="input-row edge-edit-row">
                  <input
                    type="text"
                    placeholder="Desde"
                    value={selectedEdge.from}
                    onChange={e => setSelectedEdge(prev => prev ? { ...prev, from: e.target.value } : prev)}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateSelectedEdge()}
                    maxLength={20}
                    list="nodes-list"
                  />
                  <span className="arrow">{directed ? '→' : '↔'}</span>
                  <input
                    type="text"
                    placeholder="Hasta"
                    value={selectedEdge.to}
                    onChange={e => setSelectedEdge(prev => prev ? { ...prev, to: e.target.value } : prev)}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateSelectedEdge()}
                    maxLength={20}
                    list="nodes-list"
                  />
                  <input
                    type="number"
                    placeholder="Costo"
                    value={selectedEdge.weight}
                    onChange={e => setSelectedEdge(prev => prev ? { ...prev, weight: e.target.value } : prev)}
                    onKeyDown={e => e.key === 'Enter' && handleUpdateSelectedEdge()}
                    min="0.1"
                    step="any"
                    className="weight-input"
                  />
                  <div className="edge-actions">
                    <button onClick={handleUpdateSelectedEdge}>Actualizar</button>
                    <button className="btn-cancel" onClick={handleDeleteSelectedEdge}>Eliminar</button>
                  </div>
                </div>
                <p className="edit-hint">Seleccionaste "{selectedEdge.originalFrom}" → "{selectedEdge.originalTo}". Editá los campos y guardá los cambios, o eliminá la conexión.</p>
              </div>
            )}
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

          <button className="btn-reset" onClick={() => setIsResetModalOpen(true)}>
            Empezar de nuevo
          </button>

          <button className="btn-export" onClick={handleExportImage} title="Exportar el grafo como imagen PNG">
            📷 Exportar como PNG
          </button>

          <div className="example-select-row">
            <input
              type="text"
              inputMode="numeric"
              value={nodeCountInput}
              onChange={e => setNodeCountInput(e.target.value)}
              onBlur={e => {
                const num = Math.max(2, Math.min(15, Number(e.target.value) || 2))
                setNodeCountInput(String(num))
              }}
              className="node-count-input"
              title="Cantidad de nodos (2-15)"
            />
            <button onClick={handleGenerateGraph}>Generar grafo</button>
          </div>

          <div className="undo-redo-bar">
            <button className="btn-undo" onClick={handleUndo} disabled={undoStack.length === 0} title="Deshacer (Ctrl+Z)">
              ↩ Deshacer
            </button>
            <button className="btn-redo" onClick={handleRedo} disabled={redoStack.length === 0} title="Rehacer (Ctrl+Shift+Z)">
              ↪ Rehacer
            </button>
          </div>

          {successMessage && (
            <div className="result success-message">
              <strong>{successMessage}</strong>
            </div>
          )}

          {error && (
            <div className="result error">
              <strong>{error}</strong>
            </div>
          )}

          {result && !hasAnimation && (
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

          {result && hasAnimation && currentStepIdx === steps.length - 1 && (
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
      <ConfirmationModal
        isOpen={isResetModalOpen}
        onClose={() => setIsResetModalOpen(false)}
        onConfirm={handleConfirmReset}
        title="¿Borrar todo?"
        message="Estás a punto de eliminar todos los puntos y conexiones que armaste. Esto no se puede deshacer."
      />
    </div>
  )
}
