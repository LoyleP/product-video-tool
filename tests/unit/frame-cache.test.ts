import { describe, expect, it } from "vitest";
import { FrameCache } from "@/engine/decode/frame-cache";

class FakeFrame {
  closed = 0;
  constructor(readonly name: string) {}
  close() {
    this.closed++;
  }
}

describe("FrameCache", () => {
  it("finds frames by presentation interval", () => {
    const cache = new FrameCache<FakeFrame>(4);
    const a = cache.insert(0, 33_333, new FakeFrame("a"));
    const b = cache.insert(33_333, 66_667, new FakeFrame("b"));
    expect(cache.lookup(0)).toBe(a);
    expect(cache.lookup(33_332)).toBe(a);
    expect(cache.lookup(33_333)).toBe(b);
    expect(cache.lookup(66_667)).toBeNull();
  });

  it("evicts and closes the least recently used frame", () => {
    const cache = new FrameCache<FakeFrame>(2);
    const a = cache.insert(0, 10, new FakeFrame("a"));
    const b = cache.insert(10, 20, new FakeFrame("b"));
    cache.lookup(5); // a is now most recent
    const c = cache.insert(20, 30, new FakeFrame("c"));
    expect(b.closed).toBe(1);
    expect(a.closed).toBe(0);
    expect(c.closed).toBe(0);
    expect(cache.size).toBe(2);
    expect(cache.lookup(15)).toBeNull();
  });

  it("closes a duplicate insert and keeps the cached frame", () => {
    const cache = new FrameCache<FakeFrame>(2);
    const a = cache.insert(0, 10, new FakeFrame("a"));
    const dup = new FakeFrame("dup");
    expect(cache.insert(0, 10, dup)).toBe(a);
    expect(dup.closed).toBe(1);
    expect(a.closed).toBe(0);
  });

  it("closes every frame exactly once on clear", () => {
    const cache = new FrameCache<FakeFrame>(3);
    const frames = [0, 1, 2].map((i) => cache.insert(i * 10, i * 10 + 10, new FakeFrame(String(i))));
    cache.clear();
    cache.clear();
    expect(frames.map((f) => f.closed)).toEqual([1, 1, 1]);
    expect(cache.size).toBe(0);
  });

  it("gives zero-duration frames a one microsecond interval", () => {
    const cache = new FrameCache<FakeFrame>(1);
    const a = cache.insert(100, 100, new FakeFrame("last"));
    expect(cache.lookup(100)).toBe(a);
  });
});
