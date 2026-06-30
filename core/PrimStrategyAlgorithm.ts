import { AbstractStrategyAlgorithm } from "./AbstractStrategyAlgorithm";
import { IStrategy } from "./interfaces/strategy.interface";
import * as graphlib from "@dagrejs/graphlib";

export class PrimStrategyAlgorithm
  extends AbstractStrategyAlgorithm
  implements IStrategy
{
  execute(graphs: string): string {
    let g = this.dotToGraph(graphs);
    this.steps = [];

    const nodes = g.nodes() as string[];
    if (nodes.length === 0) {
      this.addStep("No hay nodos en el grafo", "complete", [], []);
      return "graph{}";
    }

    const visited = new Set<string>();
    const mstEdges: { from: string; to: string; weight: number }[] = [];

    visited.add(nodes[0]);

    this.addStep(
      `Iniciando algoritmo de Prim desde "${nodes[0]}"`,
      "explore", [], [nodes[0]], 0
    );

    while (visited.size < nodes.length) {
      let minEdge: { v: string; w: string } | null = null;
      let minWeight = Infinity;

      for (const edge of g.edges()) {
        const vIn = visited.has(edge.v);
        const wIn = visited.has(edge.w);

        if (vIn !== wIn) {
          const weight = g.edge(edge) as number;
          if (weight < minWeight) {
            minWeight = weight;
            minEdge = edge;
          }
        }
      }

      if (!minEdge) {
        this.addStep(
          "No se puede conectar el resto del grafo (componentes desconectadas)",
          "complete",
          mstEdges.map(e => `${e.from}->${e.to}`),
          Array.from(visited)
        );
        break;
      }

      mstEdges.push({ from: minEdge.v, to: minEdge.w, weight: minWeight });
      visited.add(minEdge.v);
      visited.add(minEdge.w);

      this.addStep(
        `Arista seleccionada: "${minEdge.v}" ↔ "${minEdge.w}" (peso: ${minWeight})`,
        "select",
        mstEdges.map(e => `${e.from}->${e.to}`),
        Array.from(visited),
        mstEdges.reduce((s, e) => s + e.weight, 0)
      );
    }

    if (mstEdges.length > 0) {
      const totalWeight = mstEdges.reduce((s, e) => s + e.weight, 0);
      this.addStep(
        `Árbol de expansión mínimo completado. Costo total: ${totalWeight}`,
        "complete",
        mstEdges.map(e => `${e.from}->${e.to}`),
        Array.from(visited),
        totalWeight
      );
    }

    const mst = new graphlib.Graph();
    for (const e of mstEdges) {
      mst.setEdge(e.from, e.to, e.weight);
    }
    return this.graphToDot(mst, g);
  }
}
