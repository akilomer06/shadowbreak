import { PriorityQueue } from './PriorityQueue';
import type { Cell } from '../types';
export interface SearchNode extends Cell {
  g: number;
  h: number;
  f: number;
}
export interface SearchResult {
  path: Cell[];
  explored: SearchNode[];
  found: boolean;
}
export const manhattan = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
/** Four-neighbor A*: grid[y][x] === 0 is walkable. No diagonal corner cutting. */
export function findPath(grid: number[][], start: Cell, end: Cell): SearchResult {
  const s = { x: Math.floor(start.x), y: Math.floor(start.y) },
    t = { x: Math.floor(end.x), y: Math.floor(end.y) };
  const result: SearchResult = { path: [], explored: [], found: false };
  const valid = (p: Cell) => grid[p.y]?.[p.x] === 0;
  if (!valid(s) || !valid(t)) return result;
  const key = (p: Cell) => `${p.x},${p.y}`;
  const open = new PriorityQueue<Cell>(),
    closed = new Set<string>(),
    cost = new Map<string, number>(),
    parent = new Map<string, Cell>();
  cost.set(key(s), 0);
  open.push(s, manhattan(s, t));
  while (open.size) {
    const p = open.pop()!,
      k = key(p);
    if (closed.has(k)) continue;
    closed.add(k);
    const g = cost.get(k)!,
      h = manhattan(p, t);
    result.explored.push({ ...p, g, h, f: g + h });
    if (p.x === t.x && p.y === t.y) {
      result.found = true;
      let n = p;
      result.path.unshift(n);
      while (parent.has(key(n))) {
        n = parent.get(key(n))!;
        result.path.unshift(n);
      }
      return result;
    }
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      const n = { x: p.x + dx, y: p.y + dy },
        nk = key(n);
      if (!valid(n) || closed.has(nk)) continue;
      const next = g + 1;
      if (next < (cost.get(nk) ?? Infinity)) {
        cost.set(nk, next);
        parent.set(nk, p);
        open.push(n, next + manhattan(n, t));
      }
    }
  }
  return result;
}
