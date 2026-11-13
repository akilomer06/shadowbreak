import type { GameScene } from '../scenes/GameScene';
import { SaveSystem } from '../systems/SaveSystem';
import { AudioSystem } from '../systems/AudioSystem';
import type { World } from '../systems/World';
import { findPath, type SearchResult } from '../ai/AStar';
import { levelNames } from '../levels/levels';
import type { Cell, Mode } from '../types';
export const icon = (name: string, size = 20) => {
  const paths: Record<string, string> = {
    arrow: 'M4 12h16m-6-6 6 6-6 6',
    back: 'M20 12H4m6-6-6 6 6 6',
    shield: 'm12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3Zm-4 9 3 3 5-6',
    cross: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z',
    key: 'M14 10a5 5 0 1 0-4 4l3 3h3v3h4v-4l-6-6Z',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    sound: 'm4 9 5 0 5-5v16l-5-5H4V9Zm13-1c3 2 3 6 0 8m3-11c5 4 5 10 0 14',
    gear: 'm9 3 6 0 1 4 4 1v7l-4 1-1 5H9l-1-5-4-1V8l4-1 1-4Zm3 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    book: 'M12 6C7 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-4-2-9 2Zm0 0v14',
    grid: 'M3 3h18v18H3V3Zm6 0v18m6-18v18M3 9h18M3 15h18',
    pause: 'M8 5v14m8-14v14',
    close: 'm6 6 12 12M6 18 18 6',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v5l3 2',
    bag: 'M5 8h14v13H5V8Zm3 0V5a4 4 0 0 1 8 0v3',
    bolt: 'm13 2-9 12h7l-1 8 10-13h-8l1-7',
    terminal: 'm4 7 5 5-5 5m9 0h7',
    check: 'm5 12 4 4L19 6',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.grid}"/></svg>`;
};
const time = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const modeTitle = (m: Mode) => (m === 'robber' ? 'Robber Escape' : 'Zombie Survival');
export class UI {
  save = new SaveSystem();
  audio = new AudioSystem(this.save.data.settings);
  page: 'main' | 'modes' | 'levels' | 'game' = 'main';
  mode: Mode = 'robber';
  modal = '';
  private returnModal = '';
  private lastHUD = 0;
  private resultShown = false;
  private sandboxToken = 0;
  private sandboxTool = 'wall';
  private sandboxGrid: number[][] = [];
  private sandboxStart: Cell = { x: 2, y: 5 };
  private sandboxEnd: Cell = { x: 16, y: 5 };
  private sandboxResult?: SearchResult;
  private selected?: Cell;
  private root = document.querySelector<HTMLDivElement>('#ui')!;
  constructor(public scene: GameScene) {
    scene.audio = this.audio;
    scene.onUpdate = (w) => this.update(w);
    scene.onDebug = () => this.refreshDebug();
    this.root.addEventListener('click', (event) => {
      const b = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
      if (!b) return;
      this.audio.unlock();
      this.audio.play('click');
      this.action(b.dataset.action!, b.dataset.value);
    });
    this.root.addEventListener('input', (event) => this.setting(event));
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.page === 'game') {
          if (this.modal === 'pause') this.closeModal();
          else if (this.modal) this.showPause();
          else if (this.scene.world.status === 'playing') this.showPause();
        } else if (this.modal) this.closeModal();
        else if (this.page === 'levels') {
          this.page = 'modes';
          this.render();
        } else if (this.page === 'modes') this.menu();
      }
    });
    window.addEventListener('blur', () => {
      if (this.page === 'game' && !this.modal && scene.world.status === 'playing') this.showPause();
    });
  }
  menu() {
    this.page = 'main';
    this.modal = '';
    this.resultShown = false;
    this.scene.debug = false;
    this.scene.startWorld('robber', 2, true);
    this.render();
  }
  private header() {
    return `<header class="topbar"><button class="brand" data-action="home" aria-label="Shadowbreak home"><span class="brand-mark">${icon('cross', 21)}</span><span>SHADOWBREAK<span class="brand-sub">AI STEALTH & SURVIVAL</span></span></button><nav><button data-action="controls">${icon('book', 16)} <span>Field manual</span></button><button data-action="settings">${icon('gear', 16)} <span>Settings</span></button><span class="build-tag"><i></i> SYSTEM ONLINE <b>V.1.0</b></span></nav></header>`;
  }
  render() {
    this.sandboxToken++;
    this.root.innerHTML = `<div id="screen"></div><div id="hud"></div><div id="modal"></div>`;
    const screen = this.root.querySelector('#screen')!;
    this.root.classList.toggle('in-game', this.page === 'game');
    if (this.page === 'main') {
      screen.innerHTML = `<div class="menu-screen">${this.header()}<div class="hero"><div class="eyebrow"><span class="line"></span> TWO WORLDS. TWO THREATS. ONE ESCAPE.</div><h1>SHADOW<br><span>BREAK<span class="title-dot">.</span></span></h1><p class="hero-description">Think ahead. Stay unseen. Make your escape.<br>Every move matters. The AI is watching.</p><div class="hero-actions"><button class="primary large" data-action="play">Enter the shadows ${icon('arrow')}</button><button class="demo-link" data-action="demo">${icon('terminal', 18)} Explore the AI</button></div><div class="hero-meta"><span><i></i> 2 GAME MODES</span><span>6 OPERATIONS</span><span>YOUR INSTINCT. THEIR INTELLIGENCE.</span></div></div><div class="preview-label"><span class="live-dot"></span> LIVE SIMULATION <span class="preview-sep">/</span> THE SECURE MANSION</div><div class="map-callout"><span class="callout-icon">${icon('eye', 18)}</span><div><b>THEY DON'T JUST FOLLOW.</b><span>They listen. Investigate. Remember.</span></div><div class="signal"><i></i><i></i><i></i><i></i></div></div><div class="menu-bottom"><div class="mode-peeks"><button class="mode-peek" data-action="mode" data-value="robber"><span class="peek-icon amber">${icon('shield', 23)}</span><span><small>01 / STEALTH HEIST</small><b>Robber Escape</b></span>${icon('arrow', 18)}</button><button class="mode-peek" data-action="mode" data-value="zombie"><span class="peek-icon red">${icon('cross', 23)}</span><span><small>02 / OUTBREAK ESCAPE</small><b>Zombie Survival</b></span>${icon('arrow', 18)}</button></div><footer><span>BUILT TO OUTTHINK YOU.</span><button data-action="credits">Credits ${icon('arrow', 13)}</button></footer></div><span class="side-caption">TACTICAL INTELLIGENCE / HUMAN INSTINCT</span></div>`;
    }
    if (this.page === 'modes') {
      screen.innerHTML = `<div class="selection-screen">${this.header()}<main class="selection-main"><button class="back-link" data-action="home">${icon('back', 16)} BACK TO BASE</button><div class="section-heading"><div><div class="eyebrow">CHOOSE YOUR OPERATION</div><h2>Different worlds.<br>The same way out.</h2></div><p>Patience or instinct. Silence or survival.<br>How will you make your escape?</p></div><div class="mode-grid">${this.modeCard('robber')}${this.modeCard('zombie')}</div><div class="selection-foot">${icon('shield', 15)} ORIGINAL MAPS <span>·</span> ADAPTIVE ENEMIES <span>·</span> REAL PATHFINDING</div></main></div>`;
    }
    if (this.page === 'levels') {
      const unlocked = this.save.data.unlocked[this.mode];
      screen.innerHTML = `<div class="selection-screen">${this.header()}<main class="selection-main"><button class="back-link" data-action="play">${icon('back', 16)} CHANGE OPERATION</button><div class="section-heading"><div><div class="eyebrow">${this.mode === 'robber' ? '01 / STEALTH HEIST' : '02 / OUTBREAK ESCAPE'}</div><h2>${modeTitle(this.mode)}<span class="mint">.</span></h2></div><p>${this.mode === 'robber' ? 'Outsmart the guards. Steal the loot.<br>Escape unseen.' : 'Stay alive. Find the supplies.<br>Escape the outbreak.'}</p></div><div class="level-grid">${levelNames[this.mode].map((name, i) => `<button class="level-card ${i + 1 > unlocked ? 'locked' : ''}" data-action="start" data-value="${i + 1}" ${i + 1 > unlocked ? 'disabled' : ''}><div class="level-visual">${this.mapArt(this.mode, i)}<span class="level-number">0${i + 1}</span><span class="difficulty">${['INTRODUCTORY', 'CHALLENGING', 'EXPERT'][i]}</span></div><div class="level-info"><small>OPERATION 0${i + 1}</small><h3>${name}</h3><p>${this.mode === 'robber' ? [`A quiet neighborhood. A perfect first job.`, `More eyes. Locked doors. Higher stakes.`, `The final score demands a flawless plan.`][i] : [`A deserted ward. You're not alone.`, `Containment failed. Keep moving.`, `The last extraction. Make it count.`][i]}</p><div class="level-bottom"><span>${i + 1 > unlocked ? 'COMPLETE PREVIOUS OPERATION' : this.save.data.best[`${this.mode}-${i + 1}`] ? `BEST ${this.save.data.best[`${this.mode}-${i + 1}`].toLocaleString()}` : 'READY TO DEPLOY'}</span>${icon(i + 1 > unlocked ? 'key' : 'arrow', 18)}</div></div></button>`).join('')}</div><p class="level-note">${icon('key', 14)} Complete an operation to unlock the next. Progress saves automatically.</p></main></div>`;
    }
    if (this.page === 'game') {
      screen.innerHTML = '';
      this.renderHUD();
    }
  }
  private modeCard(mode: Mode) {
    return `<button class="mode-card ${mode}" data-action="mode" data-value="${mode}"><div class="mode-art">${this.mapArt(mode, 1)}<span class="art-tag"><i></i> ${mode === 'robber' ? 'KEEP A LOW PROFILE' : 'CONTAINMENT FAILED'}</span><div class="art-symbol">${icon(mode === 'robber' ? 'shield' : 'cross', 66)}</div></div><div class="mode-info"><div class="eyebrow">${mode === 'robber' ? '01 / STEALTH HEIST' : '02 / OUTBREAK ESCAPE'}</div><h3>${modeTitle(mode)}</h3><p>${mode === 'robber' ? 'Outsmart the guards. Steal the loot. Escape unseen.' : 'Stay alive. Find the supplies. Escape the outbreak.'}</p><div class="card-bottom"><span>3 OPERATIONS <b>·</b> ${mode === 'robber' ? 'STEALTH & STRATEGY' : 'RESOURCE & SURVIVAL'}</span><span class="round-arrow">${icon('arrow', 18)}</span></div></div></button>`;
  }
  private mapArt(mode: Mode, id: number) {
    const color = mode === 'robber' ? '#b5a16a' : '#7ea594';
    return `<svg class="map-art" viewBox="0 0 560 260" fill="none" aria-hidden="true"><defs><pattern id="tiles-${mode}-${id}" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0v25" stroke="${color}" stroke-opacity=".12"/></pattern></defs><rect width="560" height="260" fill="${mode === 'robber' ? '#162424' : '#172927'}"/><rect width="560" height="260" fill="url(#tiles-${mode}-${id})"/><g transform="translate(${id * 9},${-id * 3}) rotate(-12 280 130)"><path d="M50 30h455v200H50V30Zm150 0v75m0 40v85m145-200v75m0 40v85M50 105h70m35 0h125m35 0h190M50 145h150m30 0h115m30 0h130" stroke="#3a504c" stroke-width="10"/><path d="M65 50h75v25H65zM365 50h65v25h-65zM230 170h70v40h-70zM65 175h95v30H65z" fill="${color}" fill-opacity=".3" stroke="${color}" stroke-opacity=".3"/><path d="M245 60h45v25h-45zM390 175h60v27h-60z" fill="#658981" fill-opacity=".3"/><path class="patrol-line" d="M100 125h175V65h40v60h125" stroke="${color}" stroke-opacity=".55" stroke-dasharray="4 6"/><circle cx="275" cy="125" r="5" fill="${color}"/><path d="m275 125 50-26v52l-50-26" fill="${color}" fill-opacity=".12"/><circle cx="440" cy="125" r="5" fill="#92e1be"/><path d="m440 125-25 45h50l-25-45" fill="#92e1be" fill-opacity=".1"/></g></svg>`;
  }
  private action(action: string, value?: string) {
    switch (action) {
      case 'home':
        this.menu();
        break;
      case 'play':
        this.page = 'modes';
        this.scene.paused = true;
        this.render();
        break;
      case 'mode':
        this.mode = value as Mode;
        this.page = 'levels';
        this.scene.paused = true;
        this.render();
        break;
      case 'start':
        this.start(Number(value));
        break;
      case 'controls':
        this.returnModal = this.page === 'game' ? 'pause' : '';
        this.showModal('controls');
        break;
      case 'settings':
        this.returnModal = this.page === 'game' ? 'pause' : '';
        this.showModal('settings');
        break;
      case 'credits':
        this.showModal('credits');
        break;
      case 'demo':
        this.showModal('demo');
        break;
      case 'sandbox':
        this.showSandbox();
        break;
      case 'demo-robber':
        this.mode = 'robber';
        this.start(2, true);
        break;
      case 'demo-zombie':
        this.mode = 'zombie';
        this.start(3, true);
        break;
      case 'close':
        if (this.modal === 'won' || this.modal === 'lost') {
          this.action('operations');
          break;
        }
        if (this.returnModal) {
          this.returnModal = '';
          this.showPause();
        } else this.closeModal();
        break;
      case 'pause':
        this.showPause();
        break;
      case 'resume':
        this.closeModal();
        break;
      case 'restart':
        this.start(this.scene.world.level.id, this.scene.debug);
        break;
      case 'next':
        this.start(Math.min(3, this.scene.world.level.id + 1), this.scene.debug);
        break;
      case 'operations':
        this.page = 'levels';
        this.scene.attract = true;
        this.scene.paused = true;
        this.modal = '';
        this.render();
        break;
      case 'debug':
        this.scene.debug = !this.scene.debug;
        this.refreshDebug();
        break;
      case 'map':
        this.scene.minimap = !this.scene.minimap;
        break;
      case 'mute':
        this.save.data.settings.muted = !this.save.data.settings.muted;
        this.audio.refresh();
        this.save.write();
        if (this.modal === 'settings') this.modalContents();
        break;
      case 'sandbox-tool':
        this.sandboxTool = value!;
        this.root
          .querySelectorAll('[data-action="sandbox-tool"]')
          .forEach((b) => b.classList.toggle('active', (b as HTMLElement).dataset.value === value));
        break;
      case 'sandbox-run':
        this.runSandbox();
        break;
      case 'sandbox-reset':
        this.initSandbox();
        this.drawSandbox();
        break;
    }
  }
  start(level: number, debug = false) {
    this.page = 'game';
    this.modal = '';
    this.returnModal = '';
    this.resultShown = false;
    this.scene.debug = debug;
    this.scene.minimap = true;
    this.scene.startWorld(this.mode, level);
    this.render();
    this.audio.unlock();
    this.scene.game.canvas.focus();
  }
  private renderHUD() {
    const w = this.scene.world,
      p = w.player;
    this.root.querySelector('#hud')!.innerHTML =
      `<div class="hud-top"><div class="hud-brand"><span class="brand-mark small">${icon('cross', 18)}</span><div><small>${modeTitle(this.mode).toUpperCase()} / 0${w.level.id}</small><b>${w.level.name}</b></div></div><div class="mission-checks"><span id="loot-check">${icon('bag', 16)} <b id="loot-value">0 / ${w.level.required}</b> ${this.mode === 'robber' ? 'VALUABLES' : 'SUPPLIES'}</span><span id="key-check">${icon('key', 16)} <b id="key-value">${this.mode === 'robber' ? 'EXIT KEY' : 'ACCESS CARD'}</b></span></div><div class="hud-buttons"><span class="mission-time">${icon('clock', 16)} <b id="timer">00:00</b></span><button class="icon-button" data-action="debug" title="AI visualization (F3)">${icon('terminal', 19)}</button><button class="icon-button" data-action="pause" title="Pause (Esc)">${icon('pause', 18)}</button></div></div><div class="mission-brief"><span class="eyebrow">CURRENT OBJECTIVE</span><p id="objective">${this.mode === 'robber' ? 'Collect the valuables. Keep out of sight.' : 'Find medical supplies. Watch your resources.'}</p><span id="status-message"></span><div id="visibility-status" class="visibility-status" data-state="clear" role="status">● UNSEEN</div></div><aside id="inspector" class="inspector"></aside><div class="minimap-panel" id="minimap-panel"><div><span>${icon('grid', 12)} FLOOR PLAN</span><button data-action="map">M</button></div><canvas id="minimap" width="220" height="152"></canvas><small><i class="mint-dot"></i> YOU <i class="amber-dot"></i> OBJECTIVE <i class="red-dot"></i> THREAT</small></div><div id="interaction" class="interaction"></div><div class="hud-bottom"><div class="player-condition"><span class="portrait">${icon(this.mode === 'robber' ? 'shield' : 'cross', 22)}</span><div>${this.mode === 'robber' ? `<div class="resource-line"><span>DETECTION</span><b id="detect-text">UNSEEN</b></div><div class="meter"><i id="detect-bar"></i></div><span class="condition-note" id="stance">STANDING · VISIBLE</span>` : `<div class="resource-line"><span>VITALS</span><b id="health-value">100</b></div><div class="meter health"><i id="health-bar"></i></div><div class="mini-resources"><span>STM <i><b id="stamina-bar"></b></i></span><span>BAT <i><b id="battery-bar"></b></i></span></div>`}</div></div><div class="controls-strip"><span><kbd>W A S D</kbd> MOVE</span><span><kbd>SHIFT</kbd> SPRINT</span><span><kbd>${this.mode === 'robber' ? 'C' : 'F'}</kbd> ${this.mode === 'robber' ? 'SNEAK' : 'LIGHT'}</span><span><kbd>E</kbd> INTERACT</span><span><kbd>SPACE</kbd> ${this.mode === 'robber' ? 'DISTRACT' : 'PUSH'} <b id="action-count">${this.mode === 'robber' ? p.distractions : p.pushes}</b></span></div><span class="debug-hint"><kbd>F3</kbd> AI VIEW</span></div>`;
    this.refreshDebug();
  }
  private refreshDebug() {
    const panel = this.root.querySelector<HTMLElement>('#inspector');
    if (panel) panel.style.display = this.scene.debug ? 'block' : 'none';
    this.root.querySelector('[data-action="debug"]')?.classList.toggle('active', this.scene.debug);
  }
  private update(w: World) {
    if (this.page !== 'game') return;
    if (w.status !== 'playing' && !this.resultShown) {
      this.resultShown = true;
      this.scene.paused = true;
      if (w.status === 'won') {
        const r = w.result();
        this.save.complete(w.level.mode, w.level.id, r.score);
      }
      this.showModal(w.status);
      return;
    }
    if (performance.now() - this.lastHUD < 90) return;
    this.lastHUD = performance.now();
    const p = w.player;
    const text = (id: string, v: string) => {
      const el = document.getElementById(id);
      if (el && el.textContent !== v) el.textContent = v;
    };
    const bar = (id: string, n: number) => {
      const el = document.getElementById(id);
      if (el) el.style.width = `${n}%`;
    };
    text('timer', time(w.time));
    text(
      'loot-value',
      `${Math.min(p.loot, w.level.required)} / ${w.level.required}${p.loot > w.level.required ? ` +${p.loot - w.level.required} BONUS` : ''}`,
    );
    text('key-value', p.key ? 'SECURED' : this.mode === 'robber' ? 'EXIT KEY' : 'ACCESS CARD');
    document.getElementById('key-check')?.classList.toggle('complete', p.key);
    document.getElementById('loot-check')?.classList.toggle('complete', p.loot >= w.level.required);
    text('action-count', String(this.mode === 'robber' ? p.distractions : p.pushes));
    text(
      'objective',
      p.loot < w.level.required
        ? this.mode === 'robber'
          ? 'Collect the valuables. Keep out of sight.'
          : 'Recover the medical supplies. Stay alive.'
        : !p.key
          ? 'Find the exit credentials.'
          : 'Reach the evacuation exit →',
    );
    text('status-message', w.messageTime > 0 ? w.message : '');
    const visible = w.enemies.some((e) => e.alive && e.sees),
      pursued = w.enemies.some((e) => e.alive && ['CHASE', 'ATTACK', 'SEARCH'].includes(e.state));
    const indicator = document.getElementById('visibility-status');
    text(
      'visibility-status',
      visible
        ? '● SPOTTED · GET OUT OF THE BEAM'
        : p.hidden
          ? '● CONCEALED'
          : pursued
            ? '● OUT OF SIGHT · ENEMIES SEARCHING'
            : '● UNSEEN',
    );
    if (indicator)
      indicator.dataset.state = visible ? 'spotted' : pursued && !p.hidden ? 'searching' : 'clear';
    text('interaction', w.prompt);
    document.getElementById('interaction')?.classList.toggle('visible', !!w.prompt);
    if (this.mode === 'robber') {
      const d = Math.max(0, ...w.enemies.map((e) => e.detection));
      bar('detect-bar', d * 100);
      text(
        'detect-text',
        w.enemies.some((e) => e.state === 'CHASE') ? 'PURSUIT' : d > 0.2 ? 'SUSPICIOUS' : 'UNSEEN',
      );
      text(
        'stance',
        p.hidden
          ? 'CONCEALED · PRESS E TO LEAVE'
          : p.crouching
            ? 'CROUCHING · LOW NOISE'
            : p.sprinting
              ? 'SPRINTING · HIGH NOISE'
              : 'STANDING · VISIBLE',
      );
    } else {
      bar('health-bar', p.health);
      bar('stamina-bar', p.stamina);
      bar('battery-bar', p.battery);
      text('health-value', `${Math.ceil(p.health)} / 100`);
    }
    const mini = document.getElementById('minimap-panel');
    if (mini) mini.style.display = this.scene.minimap ? 'block' : 'none';
    if (this.scene.minimap) this.drawMinimap(w);
    if (this.scene.debug) {
      this.refreshDebug();
      const panel = document.getElementById('inspector')!;
      panel.innerHTML = `<div class="inspector-title"><i></i> LIVE AI INSPECTOR <kbd>F3</kbd></div><div class="inspector-legend"><span class="cyan">PATH / VISION</span><span class="amber">MEMORY / TARGET</span></div>${w.enemies.map((e) => `<div class="enemy-row"><div><b>${e.id} <small>${e.config.kind}</small></b><span class="state ${e.state === 'CHASE' ? 'danger' : ''}">${e.stunned > 0 ? 'STUNNED' : e.state}</span></div><p>TARGET ${Math.floor(e.target.x)},${Math.floor(e.target.y)} <span>PATH ${e.path.length} · ${e.found ? 'FOUND' : 'BLOCKED'}</span></p><p>DETECTION ${Math.round(e.detection * 100)}% <span>${e.sees ? 'VISUAL CONTACT' : e.memory ? 'LAST KNOWN POSITION' : 'NO CONTACT'}</span></p></div>`).join('')}<p class="inspector-note">A* · Manhattan heuristic · 4 neighbors<br>Vision uses wall-blocked rays. Noise leaves a memory; enemies never track unseen movement.</p>`;
    } else this.refreshDebug();
  }
  private drawMinimap(w: World) {
    const c = document.querySelector<HTMLCanvasElement>('#minimap');
    if (!c) return;
    const ctx = c.getContext('2d')!,
      l = w.level,
      scale = Math.min(212 / l.width, 144 / l.height),
      ox = (220 - l.width * scale) / 2,
      oy = (152 - l.height * scale) / 2;
    ctx.clearRect(0, 0, 220, 152);
    for (let y = 0; y < l.height; y++)
      for (let x = 0; x < l.width; x++) {
        ctx.fillStyle =
          l.tiles[y][x] === 1 ? '#465b58' : l.tiles[y][x] === 2 ? '#2a3e3a' : '#142622';
        ctx.fillRect(ox + x * scale, oy + y * scale, scale - 0.3, scale - 0.3);
      }
    const dot = (p: Cell, col: string, r = 2) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(ox + p.x * scale, oy + p.y * scale, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const d of l.doors) {
      ctx.fillStyle = d.locked ? '#d4af76' : d.open ? '#4d8d70' : '#70968a';
      ctx.fillRect(ox + d.x * scale, oy + d.y * scale, scale, scale);
    }
    for (const i of l.items) if (!i.collected) dot({ x: i.x + 0.5, y: i.y + 0.5 }, '#e6c17d');
    for (const e of w.enemies) if (e.alive) dot(e, '#d77870');
    dot({ x: l.exit.x + 0.5, y: l.exit.y + 0.5 }, '#c4e6ce', 3);
    dot(w.player, '#8de9c1', 3);
  }
  private showPause() {
    if (this.page !== 'game' || this.scene.world.status !== 'playing') return;
    this.returnModal = '';
    this.showModal('pause');
  }
  private showModal(name: string) {
    this.modal = name;
    this.scene.paused = true;
    this.modalContents();
  }
  private closeModal() {
    this.modal = '';
    this.returnModal = '';
    this.sandboxToken++;
    const host = this.root.querySelector('#modal');
    if (host) host.innerHTML = '';
    this.scene.paused = this.page !== 'game' && this.page !== 'main';
    this.scene.input.keyboard?.resetKeys();
  }
  private modalContents() {
    const host = this.root.querySelector('#modal')!;
    let html = '',
      wide = false;
    const close = `<button class="modal-close icon-button" data-action="close" aria-label="Close">${icon('close')}</button>`;
    if (this.modal === 'pause')
      html = `<div class="eyebrow">TAKE A BREATH</div><h2>In the shadows.</h2><p>Your operation is paused.</p><div class="vertical-actions"><button class="primary" data-action="resume">Resume operation ${icon('arrow')}</button><button data-action="restart">Restart operation</button><button data-action="controls">Field manual</button><button data-action="settings">Settings</button><button class="subtle" data-action="home">Return to main menu</button></div>`;
    if (this.modal === 'controls')
      html = `<div class="eyebrow">FIELD MANUAL / 01</div><h2>Know your way out.</h2><p>Collect every marked objective and the exit key or access card, then reach the glowing exit on the right side of the map.</p><div class="control-table">${[
        ['W A S D / ↑ ↓ ← →', 'Move · diagonal movement is normalized'],
        ['SHIFT', 'Sprint · drains stamina in Survival'],
        ['C / CTRL', 'Sneak · less noise and slower detection'],
        ['E', 'Collect · open / close door · hide / leave locker'],
        ['SPACE', 'Heist: throw a distraction ahead · Survival: push'],
        ['F', 'Toggle survivor flashlight · uses battery'],
        ['M / F3', 'Toggle floor plan / live AI visualization'],
        ['ESC', 'Pause or resume'],
      ]
        .map(([a, b]) => `<div><kbd>${a}</kbd><span>${b}</span></div>`)
        .join(
          '',
        )}</div><div class="tip">${icon('eye', 20)}<span>Walls and furniture block sight. Break line of sight before hiding in a locker. Closed doors stop sight and movement; enemies can open unlocked doors.</span></div>`;
    if (this.modal === 'settings') {
      const s = this.save.data.settings;
      html = `<div class="eyebrow">PERSONALIZE YOUR OPERATION</div><h2>Settings<span class="mint">.</span></h2><p>Changes save automatically on this device.</p><div class="settings-list">${(['master', 'music', 'sfx'] as const).map((k) => `<label><span>${k === 'master' ? 'Master volume' : k === 'music' ? 'Ambient music' : 'Sound effects'} <b id="setting-${k}">${Math.round(s[k] * 100)}%</b></span><input type="range" min="0" max="100" value="${s[k] * 100}" data-setting="${k}" aria-label="${k} volume"></label>`).join('')}<label class="toggle-row"><span>Mute all audio</span><input type="checkbox" data-setting="muted" ${s.muted ? 'checked' : ''}></label><label class="toggle-row"><span>Camera shake</span><input type="checkbox" data-setting="shake" ${s.shake ? 'checked' : ''}></label></div><p class="fine-print">Audio begins after your first interaction. Keyboard controls always support both WASD and arrow keys.</p>`;
    }
    if (this.modal === 'credits')
      html = `<div class="eyebrow">MADE FOR THE CURIOUS</div><h2>Human instinct.<br>Artificial intelligence.</h2><p>SHADOWBREAK is an original browser game built with TypeScript, Phaser 3 and Vite.</p><p>All pixel characters, environments, diagrams and synthesized audio are created in code. No external art, fonts or sound files are required.</p><div class="tip">${icon('terminal')}<span>Designed to make A* pathfinding, finite state machines and perception understandable through play.</span></div><p class="fine-print">Phaser: MIT license · TypeScript: Apache 2.0 · Vite: MIT. See README for implementation and scoring.</p>`;
    if (this.modal === 'demo')
      html = `<div class="eyebrow">UNDER THE SURFACE</div><h2>Meet the intelligence.</h2><p>Go behind the game. See the same algorithms that power every patrol, pursuit and escape.</p><div class="demo-options"><button data-action="sandbox"><span>${icon('grid', 26)}<b>Interactive A* laboratory</b><small>Draw obstacles. Inspect costs. Find the shortest route.</small></span>${icon('arrow')}</button><button data-action="demo-robber"><span>${icon('eye', 26)}<b>Guard behavior in action</b><small>Play the mansion with vision, paths and states visible.</small></span>${icon('arrow')}</button><button data-action="demo-zombie"><span>${icon('cross', 26)}<b>Inside the outbreak</b><small>Observe three zombie types using a shared state machine.</small></span>${icon('arrow')}</button></div>`;
    if (this.modal === 'won' || this.modal === 'lost') {
      const w = this.scene.world,
        r = w.result(),
        won = this.modal === 'won';
      html = `<div class="eyebrow">${modeTitle(this.mode).toUpperCase()} / OPERATION 0${w.level.id}</div><div class="result-symbol ${won ? '' : 'lost'}">${won ? r.grade : icon(this.mode === 'robber' ? 'shield' : 'cross', 36)}</div><h2>${won ? 'Out of the shadows.' : this.mode === 'robber' ? 'Cover blown.' : 'Extraction failed.'}</h2><p>${won ? (this.mode === 'robber' ? 'The valuables are safe. And so are you.' : 'Supplies secured. You made it out alive.') : w.reason}</p><div class="result-stats"><div><small>${won ? 'FINAL SCORE' : 'OBJECTIVES'}</small><strong>${won ? r.score.toLocaleString() : `${w.player.loot}/${w.level.required}`}</strong></div><div><small>OPERATION TIME</small><strong>${time(w.time)}</strong></div><div><small>${this.mode === 'robber' ? 'DETECTIONS' : 'HEALTH LEFT'}</small><strong>${this.mode === 'robber' ? w.detections : Math.ceil(w.player.health)}</strong></div></div>${won ? `<p class="fine-print">${w.detections === 0 ? 'Ghost bonus +1,500 · ' : ''}${w.alarms} civilian alarms · ${w.stealth} stealth actions<br>Grade thresholds: S ≥ 6,500 · A ≥ 4,800 · B ≥ 3,000 · C &lt; 3,000</p>` : ''}<div class="vertical-actions"><button class="primary" data-action="${won && w.level.id < 3 ? 'next' : won ? 'operations' : 'restart'}">${won && w.level.id < 3 ? 'Next operation' : won ? 'Choose operation' : 'Try again'} ${icon('arrow')}</button><button data-action="${won ? 'restart' : 'operations'}">${won ? 'Play again' : 'Choose operation'}</button><button class="subtle" data-action="home">Return to main menu</button></div>`;
    }
    if (this.modal === 'sandbox') {
      wide = true;
      html = `<div class="eyebrow">AI LABORATORY / SAME ALGORITHM. YOUR MAP.</div><h2>The shortest way out.</h2><p>A* chooses the lowest <b>F = G + H</b>. G is distance traveled. H is the Manhattan distance to the goal.</p><div class="sandbox-toolbar">${[
        ['wall', 'Draw walls'],
        ['start', 'Set start'],
        ['end', 'Set goal'],
        ['inspect', 'Inspect cell'],
      ]
        .map(
          ([v, t]) =>
            `<button class="${this.sandboxTool === v ? 'active' : ''}" data-action="sandbox-tool" data-value="${v}">${t}</button>`,
        )
        .join(
          '',
        )}<button data-action="sandbox-reset">Reset</button><button class="primary" data-action="sandbox-run">Run A* ${icon('arrow', 16)}</button></div><canvas id="sandbox" width="760" height="440" aria-label="Interactive pathfinding grid"></canvas><div class="sandbox-readout" id="sandbox-readout">Choose a tool and click cells. Green = start · amber = goal · blue = explored · mint = final path.</div><div class="tip">${icon('terminal', 20)}<span>Four-direction movement · binary min heap · closed set · parent reconstruction. Unreachable targets return no path. Click an explored cell with Inspect to see its G, H and F costs.</span></div>`;
    }
    host.innerHTML = `<div class="modal-backdrop"><section class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${this.modal}">${close}${html}</section></div>`;
  }
  private setting(event: Event) {
    const input = event.target as HTMLInputElement,
      k = input.dataset.setting;
    if (!k) return;
    const s = this.save.data.settings;
    if (k === 'muted' || k === 'shake') s[k] = input.checked;
    else if (k === 'master' || k === 'music' || k === 'sfx') {
      s[k] = Number(input.value) / 100;
      const label = document.getElementById(`setting-${k}`);
      if (label) label.textContent = `${input.value}%`;
    }
    this.audio.refresh();
    this.save.write();
  }
  private showSandbox() {
    this.returnModal = '';
    this.sandboxTool = 'wall';
    this.showModal('sandbox');
    this.initSandbox();
    this.drawSandbox();
    const canvas = document.querySelector<HTMLCanvasElement>('#sandbox')!;
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect(),
        x = Math.floor(((e.clientX - r.left) / r.width) * 19),
        y = Math.floor(((e.clientY - r.top) / r.height) * 11);
      if (x < 0 || x >= 19 || y < 0 || y >= 11) return;
      this.selected = { x, y };
      if (this.sandboxTool === 'start') {
        this.sandboxResult = undefined;
        this.sandboxToken++;
        this.sandboxStart = { x, y };
        this.sandboxGrid[y][x] = 0;
      } else if (this.sandboxTool === 'end') {
        this.sandboxResult = undefined;
        this.sandboxToken++;
        this.sandboxEnd = { x, y };
        this.sandboxGrid[y][x] = 0;
      } else if (
        this.sandboxTool === 'wall' &&
        !(x === this.sandboxStart.x && y === this.sandboxStart.y) &&
        !(x === this.sandboxEnd.x && y === this.sandboxEnd.y)
      ) {
        this.sandboxGrid[y][x] = this.sandboxGrid[y][x] ? 0 : 1;
        this.sandboxResult = undefined;
        this.sandboxToken++;
      }
      this.drawSandbox();
      if (this.sandboxTool === 'inspect') {
        const n = this.sandboxResult?.explored.find((p) => p.x === x && p.y === y);
        document.getElementById('sandbox-readout')!.textContent = n
          ? `CELL (${x}, ${y})   G = ${n.g}   H = ${n.h}   F = ${n.f}`
          : `CELL (${x}, ${y}) · ${this.sandboxGrid[y][x] ? 'Blocked' : 'Not explored'}`;
      }
    });
  }
  private initSandbox() {
    this.sandboxToken++;
    this.sandboxGrid = Array.from({ length: 11 }, (_, y) =>
      Array.from({ length: 19 }, (_, x) =>
        (x === 7 && y > 1 && y < 9) || (x === 12 && y < 7) ? 1 : 0,
      ),
    );
    this.sandboxStart = { x: 2, y: 5 };
    this.sandboxEnd = { x: 16, y: 5 };
    this.sandboxResult = undefined;
  }
  private runSandbox() {
    this.sandboxResult = findPath(this.sandboxGrid, this.sandboxStart, this.sandboxEnd);
    const result = this.sandboxResult,
      token = ++this.sandboxToken,
      start = performance.now();
    const tick = () => {
      if (token !== this.sandboxToken || this.modal !== 'sandbox') return;
      const count = Math.floor((performance.now() - start) / 12);
      this.drawSandbox(count);
      if (count < result.explored.length) requestAnimationFrame(tick);
      else
        document.getElementById('sandbox-readout')!.textContent =
          `${result.found ? `PATH FOUND · ${result.path.length - 1} steps` : 'NO PATH · the goal is unreachable'} · ${result.explored.length} explored cells · Inspect an explored cell to see its costs.`;
    };
    tick();
  }
  private drawSandbox(count = Infinity) {
    const canvas = document.querySelector<HTMLCanvasElement>('#sandbox');
    if (!canvas) return;
    const c = canvas.getContext('2d')!,
      r = this.sandboxResult;
    c.clearRect(0, 0, 760, 440);
    for (let y = 0; y < 11; y++)
      for (let x = 0; x < 19; x++) {
        c.fillStyle = this.sandboxGrid[y][x] ? '#4c605e' : '#142724';
        c.fillRect(x * 40 + 1, y * 40 + 1, 38, 38);
      }
    if (r) {
      for (const p of r.explored.slice(0, count)) {
        c.fillStyle = '#284e5c';
        c.fillRect(p.x * 40 + 2, p.y * 40 + 2, 36, 36);
      }
      if (count >= r.explored.length)
        for (const p of r.path) {
          c.fillStyle = '#5baf8f';
          c.fillRect(p.x * 40 + 5, p.y * 40 + 5, 30, 30);
        }
    }
    for (const [p, col, label] of [
      [this.sandboxStart, '#8de9c1', 'S'],
      [this.sandboxEnd, '#efc47f', 'G'],
    ] as const) {
      c.fillStyle = col;
      c.fillRect(p.x * 40 + 3, p.y * 40 + 3, 34, 34);
      c.fillStyle = '#0b1a19';
      c.font = 'bold 16px monospace';
      c.textAlign = 'center';
      c.fillText(label, p.x * 40 + 20, p.y * 40 + 26);
    }
    if (this.selected) {
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      c.strokeRect(this.selected.x * 40 + 2, this.selected.y * 40 + 2, 36, 36);
    }
  }
}
