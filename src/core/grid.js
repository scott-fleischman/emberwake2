// Grid algorithms shared by world generation, dungeon validation and AI.

const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

class MinHeap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [k[p], k[i]] = [k[i], k[p]]; [v[p], v[i]] = [v[i], v[p]];
      i = p;
    }
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      k[0] = lk; v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < k.length && k[l] < k[m]) m = l;
        if (r < k.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]]; [v[m], v[i]] = [v[i], v[m]];
        i = m;
      }
    }
    return top;
  }
}

// costFn(x0,y0,x1,y1) -> step cost (Infinity = blocked). 4-connected.
export function astar(w, h, costFn, start, goal, heuristicScale = 1) {
  const idx = (x, y) => y * w + x;
  const g = new Float64Array(w * h).fill(Infinity);
  const from = new Int32Array(w * h).fill(-1);
  const closed = new Uint8Array(w * h);
  const heap = new MinHeap();
  const s = idx(start.x, start.y), t = idx(goal.x, goal.y);
  g[s] = 0;
  heap.push(0, s);
  while (heap.size) {
    const cur = heap.pop();
    if (cur === t) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w, cy = (cur / w) | 0;
    for (const [dx, dy] of N4) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = idx(nx, ny);
      if (closed[n]) continue;
      const c = costFn(cx, cy, nx, ny);
      if (!isFinite(c)) continue;
      const ng = g[cur] + c;
      if (ng < g[n]) {
        g[n] = ng;
        from[n] = cur;
        const hcost = (Math.abs(goal.x - nx) + Math.abs(goal.y - ny)) * heuristicScale;
        heap.push(ng + hcost, n);
      }
    }
  }
  if (!isFinite(g[t])) return null;
  const path = [];
  for (let c = t; c !== -1; c = from[c]) path.push({ x: c % w, y: (c / w) | 0 });
  return path.reverse();
}

// Multi-source BFS. Returns Int32Array of step distances, -1 where unreachable.
export function bfsDistances(w, h, passable, sources) {
  const d = new Int32Array(w * h).fill(-1);
  const q = new Int32Array(w * h);
  let head = 0, tail = 0;
  for (const s of sources) {
    const i = s.y * w + s.x;
    if (d[i] === -1) { d[i] = 0; q[tail++] = i; }
  }
  while (head < tail) {
    const cur = q[head++];
    const cx = cur % w, cy = (cur / w) | 0;
    for (const [dx, dy] of N4) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (d[n] !== -1 || !passable(nx, ny)) continue;
      d[n] = d[cur] + 1;
      q[tail++] = n;
    }
  }
  return d;
}

export function floodComponent(w, h, passable, start) {
  const d = bfsDistances(w, h, passable, [start]);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < d.length; i++) if (d[i] >= 0) out[i] = 1;
  return out;
}

// Label connected components; returns {labels:Int32Array, sizes:number[]}
export function components(w, h, passable) {
  const labels = new Int32Array(w * h).fill(-1);
  const sizes = [];
  const q = new Int32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (labels[i] !== -1 || !passable(i % w, (i / w) | 0)) continue;
    const id = sizes.length;
    let head = 0, tail = 0, size = 0;
    labels[i] = id; q[tail++] = i;
    while (head < tail) {
      const cur = q[head++]; size++;
      const cx = cur % w, cy = (cur / w) | 0;
      for (const [dx, dy] of N4) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const n = ny * w + nx;
        if (labels[n] !== -1 || !passable(nx, ny)) continue;
        labels[n] = id; q[tail++] = n;
      }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

export { N4 };
