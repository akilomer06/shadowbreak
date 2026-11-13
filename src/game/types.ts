export type Mode = 'robber' | 'zombie';
export interface Cell {
  x: number;
  y: number;
}
export interface Room {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tint: number;
}
export interface Prop extends Cell {
  kind: 'sofa' | 'bed' | 'desk' | 'shelf' | 'plant' | 'table' | 'medical' | 'machine';
  w: number;
  h: number;
}
export interface Door extends Cell {
  id: string;
  open: boolean;
  locked: boolean;
  vertical: boolean;
}
export interface Item extends Cell {
  id: string;
  kind: 'loot' | 'key' | 'health' | 'battery';
  collected: boolean;
}
export interface EnemyConfig extends Cell {
  kind: 'guard' | 'scout' | 'normal' | 'fast' | 'heavy';
  route: Cell[];
}
export interface Level {
  id: number;
  mode: Mode;
  name: string;
  subtitle: string;
  width: number;
  height: number;
  tiles: number[][];
  rooms: Room[];
  props: Prop[];
  doors: Door[];
  items: Item[];
  enemies: EnemyConfig[];
  civilians: Cell[];
  hiding: Cell[];
  spawn: Cell;
  exit: Cell;
  required: number;
}
export const TILE = 32;
export const distance = (a: Cell, b: Cell) => Math.hypot(a.x - b.x, a.y - b.y);
export const center = (p: Cell): Cell => ({ x: p.x + 0.5, y: p.y + 0.5 });
