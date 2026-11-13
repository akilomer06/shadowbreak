import type { Cell } from '../types';
export interface Noise extends Cell {
  radius: number;
  life: number;
  source: 'player' | 'distraction' | 'door';
}
export function hear(observer: Cell, noise: Noise, multiplier = 1) {
  return Math.hypot(observer.x - noise.x, observer.y - noise.y) <= noise.radius * multiplier;
}
