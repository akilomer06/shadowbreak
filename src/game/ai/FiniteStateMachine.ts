export interface State<C> {
  enter?: (context: C) => void;
  update: (context: C, dt: number) => void;
  exit?: (context: C) => void;
}
export class FiniteStateMachine<C, S extends string> {
  current: S;
  elapsed = 0;
  constructor(
    private context: C,
    private states: Record<S, State<C>>,
    initial: S,
  ) {
    this.current = initial;
    states[initial].enter?.(context);
  }
  transition(next: S) {
    if (next === this.current) return;
    this.states[this.current].exit?.(this.context);
    this.current = next;
    this.elapsed = 0;
    this.states[next].enter?.(this.context);
  }
  update(dt: number) {
    this.elapsed += dt;
    this.states[this.current].update(this.context, dt);
  }
}
