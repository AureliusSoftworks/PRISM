export const FLYTING_GALLERY_REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
export type FlytingGalleryRegion = "for" | "neutral" | "against";
export interface FlytingGalleryMember {
  id: string;
  leaning: FlytingGalleryRegion;
}
export interface FlytingGalleryBody extends FlytingGalleryMember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  targetX: number;
  targetY: number;
  pause: number;
  age: number;
  travelling: boolean;
  pace: number;
  phase: number;
  random: () => number;
}
const clamp = (n: number, low: number, high: number): number => Math.max(low, Math.min(high, n));

function randomFor(id: string): () => number {
  let seed = 2166136261;
  for (const char of `${id}:floor-roam-v1`) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return () => {
    seed = Math.imul(seed ^ (seed >>> 16), 2246822507);
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909);
    return ((seed ^= seed >>> 16) >>> 0) / 4294967296;
  };
}

/** React owns identity/votes; this floor-space simulation owns motion.
 * No layout slots, wall-clock randomness, or per-frame React renders. */
export class FlytingGalleryWorld {
  readonly bodies = new Map<string, FlytingGalleryBody>();
  width = 1000;
  height = 240;
  bodySize = 46;
  maxVerticalRoam = 60;

  configure(width: number, height: number, bodySize: number, roam: number): void {
    if (!(width > 0 && height > 0 && bodySize > 0)) return;
    for (const body of this.bodies.values()) {
      body.x *= width / this.width;
      body.targetX *= width / this.width;
      body.vx *= width / this.width;
      body.y *= height / this.height;
      body.targetY *= height / this.height;
      body.vy *= height / this.height;
    }
    this.width = width;
    this.height = height;
    this.bodySize = bodySize;
    this.maxVerticalRoam = Number.isFinite(roam) ? clamp(roam, 0, 60) : 60;
    for (const body of this.bodies.values()) {
      this.contain(body);
      const bounds = this.bounds(body.leaning);
      body.targetX = clamp(body.targetX, bounds.left, bounds.right);
      body.targetY = clamp(body.targetY, bounds.top, bounds.bottom);
    }
  }

  bounds(region: FlytingGalleryRegion) {
    const column = region === "for" ? 0 : region === "against" ? 2 : 1;
    const margin = Math.min(this.width / 12, this.bodySize * 0.7);
    const bottom = this.height * 0.96;
    // The authoring range opens the usable floor, not the clipped image box.
    // Include the 132% mini chassis, horns, and gait above the foot anchor.
    const safeTop = Math.min(bottom, this.bodySize * 1.75);
    return {
      left: column * this.width / 3 + margin,
      right: (column + 1) * this.width / 3 - margin,
      top: bottom - (bottom - safeTop) * this.maxVerticalRoam / 60,
      bottom,
    };
  }

  sync(members: readonly FlytingGalleryMember[], reducedMotion = false): void {
    const ids = new Set(members.map((member) => member.id));
    for (const id of this.bodies.keys()) if (!ids.has(id)) this.bodies.delete(id);
    for (const member of members) {
      const current = this.bodies.get(member.id);
      if (current) {
        if (current.leaning !== member.leaning) {
          current.leaning = member.leaning;
          current.travelling = true;
          this.destination(current);
          current.pause = current.random() * 0.35;
        }
        continue;
      }
      const random = randomFor(member.id);
      const body: FlytingGalleryBody = {
        ...member, x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0,
        pause: random() * 2.5, age: 0, travelling: false,
        pace: 0.78 + random() * 0.44, phase: random() * Math.PI * 2, random,
      };
      this.destination(body);
      body.x = body.targetX;
      body.y = body.targetY;
      this.bodies.set(body.id, body);
    }
    if (reducedMotion) this.settle();
  }

  /** Reduced motion updates votes immediately and stays completely still. */
  settle(): void {
    for (const body of this.bodies.values()) {
      if (body.travelling) {
        body.x = body.targetX;
        body.y = body.targetY;
      }
      body.vx = body.vy = 0;
      body.travelling = false;
      this.contain(body);
    }
  }

  private destination(body: FlytingGalleryBody): void {
    const bounds = this.bounds(body.leaning);
    let best = -Infinity;
    // Best-of-candidates fills the region without assigning visible rows.
    for (let i = 0; i < 24; i++) {
      const x = bounds.left + body.random() * (bounds.right - bounds.left);
      const y = bounds.top + body.random() * (bounds.bottom - bounds.top);
      let clearance = this.width;
      for (const other of this.bodies.values()) {
        if (other.id === body.id) continue;
        // Reserve destinations during a mass vote. Otherwise every newcomer
        // chooses the same empty far corner before anyone has arrived there.
        const reserved = other.travelling && other.leaning === body.leaning;
        const ox = reserved ? other.targetX : other.x;
        const oy = reserved ? other.targetY : other.y;
        clearance = Math.min(clearance, Math.hypot(x - ox, (y - oy) * 1.9));
      }
      if (clearance > best) {
        best = clearance;
        body.targetX = x;
        body.targetY = y;
      }
    }
    body.age = 0;
  }

  private contain(body: FlytingGalleryBody): void {
    const bounds = this.bounds(body.leaning);
    const left = body.travelling ? this.bounds("for").left : bounds.left;
    const right = body.travelling ? this.bounds("against").right : bounds.right;
    const x = clamp(body.x, left, right);
    const y = clamp(body.y, bounds.top, bounds.bottom);
    if (x !== body.x) body.vx = 0;
    if (y !== body.y) body.vy = 0;
    body.x = x;
    body.y = y;
  }

  step(elapsedSeconds: number): void {
    if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return;
    // Suspended tabs must not fast-forward when they return.
    let remaining = Math.min(elapsedSeconds, 0.05);
    while (remaining > 0.000001) {
      const dt = Math.min(remaining, 1 / 60);
      this.tick(dt);
      remaining -= dt;
    }
  }

  private tick(dt: number): void {
    const updates: Array<[FlytingGalleryBody, number, number]> = [];
    for (const body of this.bodies.values()) {
      body.age += dt;
      body.pause = Math.max(0, body.pause - dt);
      let dx = body.targetX - body.x;
      let dy = body.targetY - body.y;
      let distance = Math.hypot(dx, dy);
      if (distance < this.bodySize * 0.17 || (!body.travelling && body.age > 12)) {
        body.travelling = false;
        this.destination(body);
        body.pause = 0.9 + body.random() * 3.1;
        dx = body.targetX - body.x;
        dy = body.targetY - body.y;
        distance = Math.hypot(dx, dy);
      }
      const speed = this.width * (body.travelling ? 0.095 : 0.014) * body.pace;
      const arrival = Math.min(speed, distance * 1.6);
      let vx = body.pause > 0 ? 0 : dx / Math.max(1, distance) * arrival;
      let vy = body.pause > 0 ? 0 : dy / Math.max(1, distance) * arrival;
      // Soft elliptical personal space allows a unanimous crowd to fit.
      for (const other of this.bodies.values()) {
        if (body === other) continue;
        const sx = body.x - other.x;
        const sy = (body.y - other.y) * 1.9;
        const gap = Math.hypot(sx, sy);
        const space = this.bodySize * 0.95;
        if (gap >= space) continue;
        const force = (1 - gap / space) * this.width * 0.028;
        const direction = body.id < other.id ? -1 : 1;
        vx += gap < 0.01 ? direction * force : sx / gap * force;
        vy += gap < 0.01 ? 0 : sy / gap * force / 1.9;
      }
      const magnitude = Math.hypot(vx, vy);
      const limit = Math.max(speed, this.width * 0.024);
      if (magnitude > limit) {
        vx *= limit / magnitude;
        vy *= limit / magnitude;
      }
      const ease = 1 - Math.exp(-dt / 0.42);
      updates.push([body, body.vx + (vx - body.vx) * ease, body.vy + (vy - body.vy) * ease]);
    }
    for (const [body, vx, vy] of updates) {
      body.vx = vx;
      body.vy = vy;
      body.x += vx * dt;
      body.y += vy * dt;
      body.phase += Math.hypot(vx, vy) * dt / Math.max(1, this.bodySize) * 5;
      this.contain(body);
    }
  }
}
