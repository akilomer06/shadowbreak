import type { Cell } from '../types';
/** Samples a supercover ray, including both cells at diagonal wall corners. */
export function lineOfSight(a: Cell, b: Cell, blocked: (x: number, y: number) => boolean): boolean {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    steps = Math.ceil(Math.hypot(dx, dy) * 16);
  let px = Math.floor(a.x),
    py = Math.floor(a.y);
  for (let i = 1; i <= steps; i++) {
    const x = Math.floor(a.x + (dx * i) / steps),
      y = Math.floor(a.y + (dy * i) / steps);
    if (blocked(x, y)) return false;
    if (x !== px && y !== py && blocked(x, py) && blocked(px, y)) return false;
    px = x;
    py = y;
  }
  return true;
}
export function inVision(
  observer: Cell,
  facing: number,
  target: Cell,
  range: number,
  fov: number,
  blocked: (x: number, y: number) => boolean,
) {
  const dx = target.x - observer.x,
    dy = target.y - observer.y;
  if (Math.hypot(dx, dy) > range) return false;
  const angle = Math.atan2(dy, dx);
  const delta = Math.atan2(Math.sin(angle - facing), Math.cos(angle - facing));
  return Math.abs(delta) <= fov / 2 && lineOfSight(observer, target, blocked);
}
export const detectionRate = (crouching: boolean, sprinting: boolean) =>
  crouching ? 0.24 : sprinting ? 1.7 : 0.8;

/** Wall-clipped flashlight outline, using the same corner occlusion rules as sight. */
export function visionOutline(
  observer: Cell,
  facing: number,
  range: number,
  fov: number,
  blocked: (x: number, y: number) => boolean,
): Cell[] {
  const points: Cell[] = [{ x: observer.x, y: observer.y }];
  const rays = Math.ceil(fov / 0.055);
  for (let i = 0; i <= rays; i++) {
    const angle = facing - fov / 2 + (fov * i) / rays,
      dx = Math.cos(angle),
      dy = Math.sin(angle);
    let previous = { x: observer.x, y: observer.y },
      px = Math.floor(observer.x),
      py = Math.floor(observer.y);
    const steps = Math.ceil(range * 16);
    for (let step = 1; step <= steps; step++) {
      const r = (range * step) / steps,
        p = { x: observer.x + dx * r, y: observer.y + dy * r },
        x = Math.floor(p.x),
        y = Math.floor(p.y);
      if (blocked(x, y) || (x !== px && y !== py && blocked(x, py) && blocked(px, y))) break;
      previous = p;
      px = x;
      py = y;
    }
    points.push(previous);
  }
  return points;
}
