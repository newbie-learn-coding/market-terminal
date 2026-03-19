declare module 'd3-force-3d' {
  export type ForceNodeLike = Record<string, unknown>;
  export type ForceFn = {
    iterations?: (value: number) => ForceFn;
    strength?: (value: number | ((node: ForceNodeLike) => number)) => ForceFn;
  };

  export function forceCollide(radius?: number | ((node: ForceNodeLike) => number)): ForceFn;
  export function forceX(x?: number | ((node: ForceNodeLike) => number)): ForceFn;
  export function forceY(y?: number | ((node: ForceNodeLike) => number)): ForceFn;
  export function forceRadial(
    radius?: number | ((node: ForceNodeLike) => number),
    x?: number,
    y?: number,
  ): ForceFn;
}
