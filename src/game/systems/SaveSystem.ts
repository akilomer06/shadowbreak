export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  shake: boolean;
}
export interface SaveData {
  settings: Settings;
  unlocked: { robber: number; zombie: number };
  best: Record<string, number>;
}
const defaults = (): SaveData => ({
  settings: { master: 0.6, music: 0.25, sfx: 0.7, muted: false, shake: true },
  unlocked: { robber: 1, zombie: 1 },
  best: {},
});
function availableStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
export class SaveSystem {
  data: SaveData;
  constructor(
    private storage: Pick<Storage, 'getItem' | 'setItem'> | undefined = availableStorage(),
  ) {
    this.data = this.load();
  }
  load() {
    const d = defaults();
    try {
      const p = JSON.parse(this.storage?.getItem('shadowbreak.v1') ?? 'null');
      if (!p || typeof p !== 'object') return d;
      const finite = (n: unknown, fallback: number) =>
        typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : fallback;
      for (const k of ['master', 'music', 'sfx'] as const)
        d.settings[k] = finite(p.settings?.[k], d.settings[k]);
      for (const k of ['muted', 'shake'] as const)
        if (typeof p.settings?.[k] === 'boolean') d.settings[k] = p.settings[k];
      for (const mode of ['robber', 'zombie'] as const)
        d.unlocked[mode] = Math.min(3, Math.max(1, Math.floor(Number(p.unlocked?.[mode]) || 1)));
      for (const [key, v] of Object.entries(p.best ?? {}))
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) d.best[key] = v;
      return d;
    } catch {
      return d;
    }
  }
  write() {
    try {
      this.storage?.setItem('shadowbreak.v1', JSON.stringify(this.data));
    } catch {
      /* Private mode / quota failure must never stop play. */
    }
  }
  complete(mode: 'robber' | 'zombie', level: number, score: number) {
    this.data.unlocked[mode] = Math.max(this.data.unlocked[mode], Math.min(3, level + 1));
    const key = `${mode}-${level}`;
    this.data.best[key] = Math.max(this.data.best[key] ?? 0, score);
    this.write();
  }
}
