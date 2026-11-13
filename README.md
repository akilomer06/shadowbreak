# SHADOWBREAK: AI Stealth & Survival

A complete local browser game with two campaigns, six operations, procedural pixel artwork, synthesized audio, explainable enemy AI, and an interactive pathfinding laboratory. Built with **TypeScript, Phaser 3, and Vite**; no backend, accounts, API keys, remote assets, or paid services.

## Run

Use Node.js 22.12+ (Node 24 supported). From this folder:

```powershell
npm install
npm run dev
```

Open the local URL Vite prints, normally **http://localhost:5173**.

```powershell
npm test                  # deterministic simulation / AI tests
npm run build            # TypeScript check and production bundle
npm run preview          # serve the production build locally
npx playwright install chromium
npm run test:browser      # browser UI and real keyboard interaction checks
npm run test:playthrough  # both first operations through victory (dev server must be running)
```

For an installed Chrome instead of downloaded Chromium, set `$env:PLAYWRIGHT_CHANNEL='chrome'` before the browser command. `npm run format` formats the sources. Browser tests start Vite automatically or reuse port 5173.

## Play

Movement is faster: walk at 3.6 tiles/s, sprint at 5.8, and sneak at 2.1. Enemy movement is approximately 20% faster, with sight ranges approximately 50% longer. Enemy vision beams are always visible, stop at walls/furniture/closed doors, and use the same effective range as detection (including crouch and flashlight modifiers). Amber beams mark guards, pale green marks infected, and red marks pursuit or visual contact. Both modes show an **Unseen / Spotted / Out of sight** indicator. Out of sight does not erase an enemy's memory.

Heist operations contain **9, 12, and 14 diamonds** respectively. The original minimum loot requirement remains 3 / 4 / 4; additional diamonds are optional bonus loot, contribute to your score, and display as `+N BONUS` in the HUD.

Choose **Enter the shadows**, a game mode, then an unlocked operation. The first operation in each campaign is initially available; finishing it unlocks the next. Settings, best scores, and progress persist in `localStorage` under `shadowbreak.v1` with validation and graceful failure when storage is unavailable.

**Robber Escape:** The Quiet House → The Secure Mansion → The High-Security Vault. Collect all valuables (mint diamonds) and the exit key (amber key), unlock the gate, and reach the mint exit arrow at the right edge. Guards can capture you after detecting and pursuing you. Sneak, break sight, hide in lockers, or throw three distractions ahead of your current facing. Suspicious behavior can startle civilians into fleeing and alerting security.

**Zombie Survival:** First Infection → Quarantine Breach → Final Evacuation. Recover all marked medical supplies and an access card, unlock the gate, and reach evacuation. Manage health, stamina, and flashlight battery. Additional first-aid and battery pickups restore resources. Four limited pushes stun nearby infected and inflict 15 damage; heavies recover faster. Normal / fast / heavy infected have 45 / 30 / 120 health and different speed, perception, damage, and attack cooldown parameters. Downed infected stop moving, attacking and separating other enemies. Pushes cannot pass through walls.

Every floor has eight furnished rooms, a central corridor, cross-room connections, functioning doors, lockers, and a locked evacuation gate. Larger operations add area, enemies, civilians, restricted doors, and objectives. Closed doors block bodies and sight. Enemies can open unlocked doors; locked doors remain impassable until the player unlocks them. Occupied doors cannot close on an actor.

| Input              | Action                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| WASD or arrow keys | Move (normalized diagonals)                                              |
| Shift              | Sprint; consumes stamina in Survival                                     |
| C or Ctrl          | Crouch / sneak in Heist                                                  |
| E                  | Collect the nearest item, interact with a door, or hide / leave a locker |
| Space              | Throw a distraction in Heist / melee push in Survival                    |
| F                  | Toggle Survival flashlight                                               |
| Mouse              | Aim while standing still                                                 |
| Mouse wheel        | Zoom in to follow the player / zoom out for the whole floor              |
| M                  | Toggle minimap                                                           |
| F3                 | Toggle live AI visualization and inspector                               |
| Escape             | Pause / resume / go back                                                 |

Hiding requires a nearby locker and a broken line of sight: a suspicious enemy watching you prevents hiding. You cannot move while concealed; press E to leave. Interaction prompts tell you what E will do. Pause also occurs when the browser window loses focus. The UI scales to narrow screens, but gameplay is designed for a keyboard and mouse; touch movement and rebinding are not implemented.

## The actual AI

### A* search

`src/game/ai/AStar.ts` is shared by enemy navigation and the interactive laboratory. A binary min heap maintains the open set, a set stores closed nodes, a cost map stores G, and a parent map reconstructs the route. Four-neighbor steps cost 1. H is Manhattan distance; F = G + H. Stable heap ties make results reproducible. Invalid and unreachable endpoints return an empty path with `found: false`. With this consistent heuristic, the result is a shortest route on the navigation grid.

Navigation is derived from the same collision tiles used by the player, including furniture and locked doors. Unlocked doors are traversable in the planner because an enemy opens them before crossing. Closed doors still block sight and physical movement. Brains recompute paths at most roughly twice per second, rather than every frame. Lightweight separation discourages exact overlap; movement is delta-time based and collision checked in substeps to prevent tunneling.

### Finite state machines

`FiniteStateMachine.ts` provides explicit state entry, update, and exit hooks with a state timer. `EnemyBrain.ts` supplies reusable state definitions:

```text
Guards:   PATROL ↔ IDLE → INVESTIGATE → CHASE → ATTACK
                              ↓         ↓       ↓
                            SEARCH ←────┘ ← CHASE
                              ↓
                            RETURN → PATROL

Zombies:  WANDER ↔ IDLE → INVESTIGATE → CHASE → ATTACK
                              ↓         ↓       ↓
                            SEARCH ←────┘ ← CHASE
                              ↓
                            RETURN → WANDER
```

Sensors run about eight times a second. A target must be inside a direction-dependent vision cone, within the configured range, and have an unobstructed sampled ray. Walls, furniture, and closed doors block that ray. Detection accumulates slowly while crouching and quickly while sprinting. Hearing consumes finite-lived noise events generated by footsteps, doors, distractions, and civilian alarms.

An enemy remembers only the last seen or heard location. After visual contact ends it follows that memory, searches nearby valid cells, and returns to its route. It never reads an unseen player's location to update its chase target. Zombies attack only at close range with sight, an expired attack cooldown, and the player's damage immunity timer clear. Enemy types share the same brain with distinct configuration; civilians use a separate idle/walk/flee routine.

### Demonstration

**Explore the AI** opens guard and zombie demonstration operations (available regardless of campaign unlocks) and the A* laboratory. F3 displays the collision grid, wall-clipped vision cones, computed paths, route waypoints, target circles, last-known-position crosses, state labels, and a live per-enemy inspector. Cyan indicates navigation/perception, amber indicates investigation/memory, and red indicates pursuit or obstacles.

In the laboratory, click cells to add/remove walls or place the start/goal. **Run A*** animates the actual search's explored nodes, then its route. **Inspect cell** displays G, H, and F for an explored node. Reset restores the original map. Failed searches explicitly display **NO PATH**. Drawing or closing the laboratory cancels the previous visualization.

## Score and grades

```text
score = max(0, valuables_or_supplies × 1000
             + max(0, 240 − seconds) × 10
             + stealth_actions × 150
             − detections × 500
             − civilian_alarms × 250
             + (zero_detections ? 1500 : 0))
```

Scores are rounded to integers. Grades: **S ≥ 6500**, **A ≥ 4800**, **B ≥ 3000**, **C < 3000**. The results screen displays score, grade, time, detections or remaining health, and stealth/civilian statistics. You can retry, continue, or return to the menu.

## Architecture

```text
src/main.ts                      Phaser bootstrap and read-only diagnostic snapshot
src/game/types.ts                Shared typed level and entity contracts
src/game/ai/                     Heap, A*, FSM, vision, hearing, enemy brain
src/game/levels/levels.ts         Six configured operations and connectivity validation
src/game/systems/World.ts        Renderer-independent gameplay simulation
src/game/systems/AudioSystem.ts  Web Audio effects and ambient score
src/game/systems/SaveSystem.ts   Validated local persistence
src/game/scenes/GameScene.ts     Procedural pixel textures, world drawing, camera and input
src/game/ui/UI.ts                Menus, HUD, live inspector and A* laboratory
src/styles/main.css              Responsive interface and accessibility styles
tests/core.test.ts               AI, gameplay, persistence and all-level route tests
tests/playthrough.test.ts        All six operations completed with active enemy AI
e2e/game.spec.mjs                Real browser interaction tests
scripts/playthrough.mjs          Keyboard-event browser wins and next-operation checks
artifacts/                       Captured browser screenshots
```

Restart replaces the complete world and destroys previous sprites/labels. There are no uncontrolled timers or spawning loops. The live inspector updates at about 10 Hz. Audio starts only after user interaction, uses separate master/music/effect gains, and fails gracefully. All illustrations, pixel characters, environmental details, particle effects, and audio are original code-generated assets. System fonts are used; there are no network font requests.

## Verification and limits

**Verified: 50 automated simulation tests passed, six Playwright browser tests passed, and the production build passed.** Unit tests cover shortest and unreachable paths, collision obstacles, heap ordering, FSM lifecycle, wall-blocked vision, crouch detection rates, hearing ranges, last-seen memory, attacks and cooldowns, infected health and downed states, health/stamina/battery limits (including sprint-exhaustion recovery), inventory, locked/occupied doors, win/lose conditions, restart isolation, persistence, and scoring.

All six maps have connectivity checks and collision-aware simulated completion routes. These isolate objective/door/collision correctness by removing enemies. A separate six-test suite completes **every operation with enemy AI active**, using only movement, interaction and resource-action inputs; it never teleports the player, injects inventory, grants invulnerability, or disables enemies. It tries several objective orders because timing and approach matter. These deterministic bot routes establish feasibility rather than subjective difficulty for a human player.

Browser checks exercise menus/settings persistence, the real A* sandbox, actual keyboard movement, doors, pickups in both modes, resource actions, pause, restarts, six scene loads with moving AI, a narrow layout, and an actual guard capture followed by retry. The separate `test:playthrough` script drives keyboard events through the live Phaser loop to complete the first operation of **both modes**, checks their victory screens, and loads each next operation. It can retry up to four actual objective routes when a guard intercepts the bot; timing varies with the browser frame rate. These checks passed with no browser runtime errors. Screenshots are in `artifacts/`.

Headless checks cannot establish subjective game balance, perceived audio quality, or 60 FPS on every student laptop. No full lighting engine or external art pack is needed: darkness and wall-clipped flashlight rendering are intentionally lightweight. Static environments are baked into a texture once per level rather than rebuilding their graphics every frame; zooming in smoothly follows the player.

Optional features omitted: touch movement, configurable keybindings, and timed evacuation. The two campaigns use the same floor-plan grammar with growing dimensions, room furnishings, locked connections and patrol composition rather than six separate art tilesets.

Dependencies: Phaser and Vite are MIT licensed; TypeScript is Apache 2.0; Vitest and Playwright are MIT / Apache 2.0 respectively. Their license files ship in installed packages.
