import type { Micros } from "../time";

export interface Closable {
  close(): void;
}

interface Entry<T> {
  start: Micros;
  end: Micros;
  value: T;
}

/**
 * LRU cache of decoded frames keyed by presentation interval. Every value is closed exactly once:
 * on eviction, on clear, or immediately if it duplicates a cached frame.
 */
export class FrameCache<T extends Closable> {
  // Map iteration order is insertion order; re-inserting on access keeps the least recent first.
  private readonly entries = new Map<Micros, Entry<T>>();

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error("FrameCache capacity must be at least 1.");
  }

  get size(): number {
    return this.entries.size;
  }

  /** The cached frame whose interval [start, end) contains `t`. */
  lookup(t: Micros): T | null {
    for (const [key, entry] of this.entries) {
      if (t >= entry.start && t < entry.end) {
        this.entries.delete(key);
        this.entries.set(key, entry);
        return entry.value;
      }
    }
    return null;
  }

  /** Adds a frame. Returns the cached value, which is the existing one when `start` is already cached. */
  insert(start: Micros, end: Micros, value: T): T {
    const existing = this.entries.get(start);
    if (existing) {
      if (existing.value !== value) value.close();
      return existing.value;
    }
    this.entries.set(start, { start, end: Math.max(end, start + 1), value });
    while (this.entries.size > this.capacity) {
      const oldestKey = this.entries.keys().next().value as Micros;
      this.entries.get(oldestKey)!.value.close();
      this.entries.delete(oldestKey);
    }
    return value;
  }

  clear(): void {
    for (const entry of this.entries.values()) entry.value.close();
    this.entries.clear();
  }
}
