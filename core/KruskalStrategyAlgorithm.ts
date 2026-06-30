import { AbstractStrategyAlgorithm } from "./AbstractStrategyAlgorithm";
import { IStrategy } from "./interfaces/strategy.interface";
import * as graphlib from "@dagrejs/graphlib";

export class KruskalStrategyAlgorithm
  extends AbstractStrategyAlgorithm
  implements IStrategy
{
  execute(graphs: string): string {
    this.steps = [];

    // Pre-filter parallel/duplicate edges: keep only the minimum weight one between each pair of nodes
    const edgeMap = new Map<string, { from: string; to: string; weight: number }>();
    const lines = graphs.split(";");
    
    lines.forEach((line) => {
      let parts = line.split("--");
      if (line.includes("->")) {
        parts = line.split("->");
      }

      if (parts.length == 2) {
        let from = parts[0].trim();
        let to = parts[1].split("[")[0].trim();
        let weight = parseFloat(parts[1].split("label=")[1].split("]")[0]);
        
        // For undirected, normalize key
        const key = [from, to].sort().join('-');
        
        const existing = edgeMap.get(key);
        if (!existing || weight < existing.weight) {
          edgeMap.set(key, { from, to, weight });
        }
      }
    });

    const g = new graphlib.Graph({ directed: false });
    // Add all nodes that were in the original dot representation (including isolated ones)
    lines.forEach((line) => {
      if (!line.includes("--") && !line.includes("->")) {
        const n = line.trim();
        if (n) {
          g.setNode(n);
        }
      }
    });

    edgeMap.forEach(({ from, to, weight }) => {
      g.setNode(from);
      g.setNode(to);
      g.setEdge(from, to, weight);
    });

    const weightFn = (e: graphlib.Edge): number => g.edge(e) as number;

    const edges: (graphlib.Edge & { weight: number })[] = g
      .edges()
      .map(e => ({ ...e, weight: weightFn(e) }))
      .sort((a, b) => a.weight - b.weight);

    const nodes = g.nodes() as string[];
    const uf = new UnionFind(nodes);
    const mstEdges: { from: string; to: string; weight: number }[] = [];
    const mstNodeSet = new Set<string>();

    for (const edge of edges) {
      const u = edge.v;
      const v = edge.w;
      const edgeKey = `${u}->${v}`;

      if (uf.find(u) !== uf.find(v)) {
        mstEdges.push({ from: u, to: v, weight: edge.weight });
        mstNodeSet.add(u);
        mstNodeSet.add(v);
        uf.union(u, v);

        this.addStep(
          `"${u}" ↔ "${v}" (peso: ${edge.weight})\n[Aceptado]`,
          "select", [edgeKey], Array.from(mstNodeSet), edge.weight
        );
      } else {
        this.addStep(
          `"${u}" ↔ "${v}" (peso: ${edge.weight})\n[Rechazado]`,
          "reject", [edgeKey], Array.from(mstNodeSet)
        );
      }
    }

    const totalWeight = mstEdges.reduce((sum, e) => sum + e.weight, 0);
    const finalEdges = mstEdges.map(e => `${e.from}->${e.to}`);

    this.addStep(
      `Árbol de expansión mínimo completado. Costo total: ${totalWeight}\n[Completado]`,
      "complete", finalEdges, Array.from(mstNodeSet), totalWeight
    );

    const mst = new graphlib.Graph();
    for (const e of mstEdges) {
      mst.setEdge(e.from, e.to, e.weight);
    }
    return this.graphToDot(mst, g);
  }
}

class UnionFind {
  private parent: Record<string, string>;
  private rank: Record<string, number>;

  constructor(elements: string[]) {
    this.parent = {};
    this.rank = {};
    elements.forEach((e) => {
      this.parent[e] = e;
      this.rank[e] = 0;
    });
  }

  find(e: string): string {
    if (this.parent[e] !== e) {
      this.parent[e] = this.find(this.parent[e]);
    }
    return this.parent[e];
  }

  union(e1: string, e2: string): void {
    const root1 = this.find(e1);
    const root2 = this.find(e2);
    if (root1 !== root2) {
      if (this.rank[root1] > this.rank[root2]) {
        this.parent[root2] = root1;
      } else if (this.rank[root1] < this.rank[root2]) {
        this.parent[root1] = root2;
      } else {
        this.parent[root2] = root1;
        this.rank[root1]++;
      }
    }
  }
}
