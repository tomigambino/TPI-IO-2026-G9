import { AlgorithmStep } from "./step.interface";

export interface IStrategy {
    execute(graph: string, nodeStart?: number | string, nodeEnd?: string | number): string;
    getSteps(): AlgorithmStep[];
}
