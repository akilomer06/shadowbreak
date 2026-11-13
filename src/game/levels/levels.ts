import type { Cell, Level, Mode, Prop } from '../types';
import { findPath } from '../ai/AStar';
export const levelNames = {
  robber: ['The Quiet House', 'The Secure Mansion', 'The High-Security Vault'],
  zombie: ['First Infection', 'Quarantine Breach', 'Final Evacuation'],
};
export function createLevel(mode: Mode, id: number): Level {
  const width = 32 + (id - 1) * 6,
    height = 24 + (id - 1) * 4,
    c = Math.floor(height / 2);
  const tiles: number[][] = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) =>
      x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 1 : 0,
    ),
  );
  const level: Level = {
    id,
    mode,
    name: levelNames[mode][id - 1],
    subtitle:
      mode === 'robber'
        ? 'Collect the valuables. Find the key. Leave no trace.'
        : 'Recover medical supplies. Secure an access card. Get out alive.',
    width,
    height,
    tiles,
    rooms: [],
    props: [],
    doors: [],
    items: [],
    enemies: [],
    civilians: [],
    hiding: [],
    spawn: { x: 2, y: c },
    exit: { x: width - 3, y: c },
    required: id === 1 ? 3 : 4,
  };
  const bounds = [
    1,
    Math.floor(width / 4),
    Math.floor(width / 2),
    Math.floor((width * 3) / 4),
    width - 1,
  ];
  const names =
    mode === 'robber'
      ? [
          'LIVING ROOM',
          'BEDROOM',
          'SECURITY',
          'TREASURE ROOM',
          'KITCHEN',
          'STORAGE',
          'STUDY',
          'EXIT CORRIDOR',
        ]
      : [
          'RECEPTION',
          'TREATMENT',
          'LABORATORY',
          'QUARANTINE',
          'STORAGE',
          'TRIAGE',
          'RESEARCH',
          'EVACUATION',
        ];
  const addProp = (p: Prop) => {
    level.props.push(p);
    for (let y = p.y; y < p.y + p.h; y++) for (let x = p.x; x < p.x + p.w; x++) tiles[y][x] = 2;
  };
  for (let x = 1; x < width - 1; x++) {
    tiles[c - 2][x] = 1;
    tiles[c + 2][x] = 1;
  }
  for (let i = 1; i < 4; i++)
    for (let y = 1; y < height - 1; y++) if (y < c - 2 || y > c + 2) tiles[y][bounds[i]] = 1;
  for (let row = 0; row < 2; row++)
    for (let col = 0; col < 4; col++) {
      const x = bounds[col] + (col ? 1 : 0),
        w = bounds[col + 1] - x,
        y = row ? c + 3 : 1,
        h = row ? height - y - 1 : c - 3,
        mid = Math.floor(x + w / 2),
        doorY = row ? c + 2 : c - 2;
      level.rooms.push({
        name: names[row * 4 + col],
        x,
        y,
        w,
        h,
        tint:
          mode === 'robber'
            ? [0x243537, 0x313335, 0x27333d, 0x353324][col]
            : [0x283d37, 0x283839, 0x263b3c, 0x3b2c2e][col],
      });
      tiles[doorY][mid] = 0;
      level.doors.push({
        id: `room-${row}-${col}`,
        x: mid,
        y: doorY,
        open: false,
        locked: false,
        vertical: false,
      });
      const roomKinds: Prop['kind'][] =
        mode === 'robber'
          ? ['sofa', 'bed', 'desk', 'shelf', 'machine', 'shelf', 'table', 'desk']
          : ['desk', 'medical', 'machine', 'medical', 'shelf', 'medical', 'desk', 'machine'];
      addProp({ x: x + 1, y: y + 1, w: Math.min(3, w - 2), h: 1, kind: roomKinds[row * 4 + col] });
      // An island just north of each objective creates cover and a deliberate fork.
      addProp({
        x: mid - 1,
        y: y + Math.floor(h / 2) - 1,
        w: 2,
        h: 1,
        kind: mode === 'zombie' && col % 2 ? 'medical' : col % 2 ? 'desk' : 'table',
      });
      if (w >= 6)
        addProp({ x: x + w - 2, y: y + h - 3, w: 1, h: 2, kind: col % 2 ? 'desk' : 'shelf' });
      addProp({ x: x + 1, y: y + h - 2, w: 1, h: 1, kind: col % 2 ? 'plant' : 'table' });
      if (col < 3) {
        const wallX = bounds[col + 1],
          dy = row ? y + Math.floor(h / 2) : y + Math.floor(h * 0.65);
        tiles[dy][wallX] = 0;
        level.doors.push({
          id: `link-${row}-${col}`,
          x: wallX,
          y: dy,
          open: id === 1,
          locked: id === 3 && col === 2,
          vertical: true,
        });
      }
      level.hiding.push({ x: x + 1, y: y + h - 3 });
    }
  const spot = (room: number): Cell => {
    const r = level.rooms[room];
    return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
  };
  const lootRooms = id === 1 ? [0, 2, 5] : [0, 2, 4, 7];
  lootRooms.forEach((r, i) =>
    level.items.push({ ...spot(r), id: `supply-${i}`, kind: 'loot', collected: false }),
  );
  level.items.push({ ...spot(id === 1 ? 3 : 6), id: 'exit-key', kind: 'key', collected: false });
  if (mode === 'robber') {
    // Extra loot is optional: keep the original objective routes, reward exploring more rooms.
    const bonusRooms = id === 1 ? [0, 1, 3, 4, 6, 7] : [0, 1, 2, 3, 4, 5, 6, 7];
    const positions = bonusRooms.map((index) => {
      const room = level.rooms[index];
      return { x: room.x + 2, y: room.y + room.h - 3 };
    });
    if (id === 3)
      for (const index of [2, 7]) {
        const room = level.rooms[index];
        positions.push({ x: room.x + room.w - 3, y: room.y + 2 });
      }
    positions.forEach((p, index) =>
      level.items.push({ ...p, id: `bonus-${index}`, kind: 'loot', collected: false }),
    );
  }
  if (mode === 'zombie')
    for (const [i, r] of [1, 4, 6].entries())
      level.items.push({
        ...spot(r),
        x: spot(r).x + 1,
        id: `resource-${i}`,
        kind: i === 1 ? 'battery' : 'health',
        collected: false,
      });
  const gate = width - 5;
  for (let y = c - 1; y <= c + 1; y++) if (y !== c) tiles[y][gate] = 1;
  level.doors.push({ id: 'exit-gate', x: gate, y: c, open: false, locked: true, vertical: true });
  const count = mode === 'robber' ? id + 1 : id + 2;
  for (let i = 0; i < count; i++) {
    const r = (i * 2 + 1) % 8,
      p = spot(r),
      other = spot(((r + 1) % 4) + (r >= 4 ? 4 : 0));
    const kind =
      mode === 'robber'
        ? i === count - 1 && id > 1
          ? 'scout'
          : 'guard'
        : id === 3 && i === 2
          ? 'heavy'
          : id > 1 && i % 3 === 1
            ? 'fast'
            : 'normal';
    level.enemies.push({
      ...p,
      kind,
      route: [p, { x: p.x, y: c }, { x: Math.min(width - 7, other.x), y: c }, other],
    });
  }
  if (mode === 'robber' && id > 1) level.civilians = [spot(0), spot(4)];
  return level;
}
/** Verify objectives before acquiring keys, then all routes with locked doors unlocked. */
export function validateLevel(level: Level): string[] {
  const errors: string[] = [],
    grid = level.tiles.map((r) => r.map((v) => (v ? 1 : 0)));
  for (const d of level.doors) grid[d.y][d.x] = d.locked ? 1 : 0;
  const key = level.items.find((i) => i.kind === 'key')!;
  const check = (p: Cell, label: string) => {
    if (!findPath(grid, level.spawn, p).found) errors.push(`Unreachable ${label} at ${p.x},${p.y}`);
  };
  check(key, 'key');
  for (const d of level.doors) grid[d.y][d.x] = 0;
  level.items.forEach((i) => check(i, i.id));
  check(level.exit, 'exit');
  for (const p of [level.spawn, ...level.enemies, ...level.civilians])
    if (grid[p.y]?.[p.x] !== 0) errors.push('Blocked spawn');
  return errors;
}
