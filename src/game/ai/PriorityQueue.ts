/** Binary min heap: O(log n) insertion and removal. Stable priority tie breaking. */
export class PriorityQueue<T> {
  private heap: { value: T; priority: number; order: number }[] = [];
  private serial = 0;
  get size() {
    return this.heap.length;
  }
  private less(a: number, b: number) {
    const x = this.heap[a],
      y = this.heap[b];
    return x.priority < y.priority || (x.priority === y.priority && x.order < y.order);
  }
  push(value: T, priority: number) {
    this.heap.push({ value, priority, order: this.serial++ });
    let i = this.heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [this.heap[i], this.heap[p]] = [this.heap[p], this.heap[i]];
      i = p;
    }
  }
  pop(): T | undefined {
    if (!this.heap.length) return;
    const first = this.heap[0],
      last = this.heap.pop()!;
    if (this.heap.length) {
      this.heap[0] = last;
      let i = 0;
      for (;;) {
        let s = i;
        const l = 2 * i + 1,
          r = l + 1;
        if (l < this.heap.length && this.less(l, s)) s = l;
        if (r < this.heap.length && this.less(r, s)) s = r;
        if (s === i) break;
        [this.heap[i], this.heap[s]] = [this.heap[s], this.heap[i]];
        i = s;
      }
    }
    return first.value;
  }
}
