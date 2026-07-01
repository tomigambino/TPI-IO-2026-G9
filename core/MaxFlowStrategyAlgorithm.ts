import { AbstractStrategyAlgorithm } from "./AbstractStrategyAlgorithm";
import { IStrategy } from "./interfaces/strategy.interface";
import * as graphlib from "@dagrejs/graphlib";

export class MaxFlowStrategyAlgorithm extends AbstractStrategyAlgorithm implements IStrategy {
  execute(graphs: string, nodeStart: string | number, nodeEnd: string | number): string {
    let g = this.dotToGraph(graphs);
    this.steps = [];

    const source = String(nodeStart);
    const sink = String(nodeEnd);

    let residualGraph = new graphlib.Graph({ directed: true });
    const originalCapacities: Record<string, number> = {};

    g.edges().forEach(edge => {
      const w = g.edge(edge) as number;
      residualGraph.setEdge(edge.v, edge.w, w);
      originalCapacities[`${edge.v}->${edge.w}`] = w;
      if (!residualGraph.hasEdge(edge.w, edge.v)) {
        residualGraph.setEdge(edge.w, edge.v, 0);
      }
    });

    let maxFlow = 0;
    let iteration = 0;
    let parent: Record<string, string | null> = {};

    this.addStep(
      `Iniciando Ford-Fulkerson (BFS) desde "${source}" hacia "${sink}"\n[Explorando]`,
      "explore", [], [source, sink], 0
    );

    while (this.bfs(residualGraph, source, sink, parent)) {
      iteration++;
      let pathFlow = Infinity;
      const path: string[] = [sink];

      for (let v = sink; v !== source; v = parent[v]!) {
        let u = parent[v]!;
        pathFlow = Math.min(pathFlow, residualGraph.edge(u, v) as number);
        path.unshift(u);
      }

      const pathEdges: string[] = [];
      for (let i = 0; i < path.length - 1; i++) {
        pathEdges.push(`${path[i]}->${path[i + 1]}`);
      }

      this.addStep(
        `Camino de aumento: ${path.join(" → ")} (flujo: ${pathFlow})\n[Aceptado]`,
        "select", pathEdges, path, maxFlow + pathFlow
      );

      for (let v = sink; v !== source; v = parent[v]!) {
        let u = parent[v]!;
        residualGraph.setEdge(u, v, (residualGraph.edge(u, v) as number) - pathFlow);
        residualGraph.setEdge(v, u, (residualGraph.edge(v, u) as number) + pathFlow);
      }

      maxFlow += pathFlow;

      const saturatedEdges: string[] = [];
      g.edges().forEach(edge => {
        const key = `${edge.v}->${edge.w}`;
        const remaining = residualGraph.edge(edge.v, edge.w) as number;
        if (remaining === 0 && originalCapacities[key]) {
          saturatedEdges.push(key);
        }
      });

      this.addStep(
        `Capacidades actualizadas. Flujo acumulado: ${maxFlow}\n[Explorando]`,
        "explore", saturatedEdges, [source, sink], maxFlow
      );

      parent = {};
    }

    const resultText = maxFlow === 1
      ? `No se encontraron más caminos de aumento. Flujo máximo: 1 unidad`
      : `No se encontraron más caminos de aumento. Flujo máximo: ${maxFlow} unidades`;

    const flowEdges: string[] = [];
    const flowNodes = new Set<string>();
    g.edges().forEach(edge => {
      const key = `${edge.v}->${edge.w}`;
      const remaining = residualGraph.edge(edge.v, edge.w) as number;
      const original = originalCapacities[key] || 0;
      if (original - remaining > 0) {
        flowEdges.push(key);
        flowNodes.add(edge.v);
        flowNodes.add(edge.w);
      }
    });
    flowNodes.add(source);
    flowNodes.add(sink);

    this.addStep(
      `${resultText}\n[Completado]`,
      "complete",
      flowEdges,
      Array.from(flowNodes),
      maxFlow
    );

    return `${maxFlow}`;
  }

  bfs(graph: graphlib.Graph, source: string, sink: string, parent: Record<string, string | null>): boolean {
    let visited: Record<string, boolean> = {};
    let queue: string[] = [];

    queue.push(source);
    visited[source] = true;
    parent[source] = null;

    while (queue.length > 0) {
      let u = queue.shift()!;

      for (let edge of graph.outEdges(u)!) {
        let v = edge.w;
        if (!visited[v] && (graph.edge(u, v) as number) > 0) {
          queue.push(v);
          visited[v] = true;
          parent[v] = u;

          if (v === sink) {
            return true;
          }
        }
      }
    }

    return false;
  }
}
