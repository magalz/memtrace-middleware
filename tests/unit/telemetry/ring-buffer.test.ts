import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../../../src/telemetry/ring-buffer.js';

describe('RingBuffer', () => {
  it('[P0] pushes items up to capacity without overflow', () => {
    const buf = new RingBuffer<number>(5);
    for (let i = 1; i <= 5; i++) {
      buf.push(i);
    }
    expect(buf.getCount()).toBe(5);
    expect(buf.toArray()).toEqual([1, 2, 3, 4, 5]);
  });

  it('[P0] drops oldest item on overflow beyond capacity', () => {
    const buf = new RingBuffer<number>(5);
    for (let i = 1; i <= 7; i++) {
      buf.push(i);
    }
    expect(buf.getCount()).toBe(5);
    expect(buf.toArray()).toEqual([3, 4, 5, 6, 7]);
  });

  it('[P0] wraps around correctly (head < tail scenario)', () => {
    const buf = new RingBuffer<number>(5);
    for (let i = 1; i <= 5; i++) {
      buf.push(i);
    }
    for (let i = 6; i <= 10; i++) {
      buf.push(i);
    }
    expect(buf.getCount()).toBe(5);
    expect(buf.toArray()).toEqual([6, 7, 8, 9, 10]);
  });

  it('[P0] handles capacity of 1 (edge case)', () => {
    const buf = new RingBuffer<string>(1);
    buf.push('a');
    expect(buf.getCount()).toBe(1);
    expect(buf.toArray()).toEqual(['a']);
    buf.push('b');
    expect(buf.getCount()).toBe(1);
    expect(buf.toArray()).toEqual(['b']);
  });

  it('[P0] throws on capacity <= 0', () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(-1)).toThrow();
  });

  it('[P1] toArray returns a snapshot copy, not internal reference', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    const snapshot = buf.toArray();
    snapshot[0] = 999;
    expect(buf.toArray()).toEqual([1, 2]);
  });

  it('[P1] handles concurrent read during write (sequential simulation)', () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    const snapshot1 = buf.toArray();
    expect(snapshot1).toEqual([1, 2]);
    buf.push(3);
    buf.push(4);
    const snapshot2 = buf.toArray();
    expect(snapshot2).toEqual([1, 2, 3, 4]);
    expect(snapshot1).toEqual([1, 2]);
  });

  it('[P1] empty buffer returns empty array', () => {
    const buf = new RingBuffer<number>(5);
    expect(buf.toArray()).toEqual([]);
    expect(buf.getCount()).toBe(0);
  });

  it('[P1] returns correct count', () => {
    const buf = new RingBuffer<string>(10);
    expect(buf.getCount()).toBe(0);
    buf.push('x');
    expect(buf.getCount()).toBe(1);
    buf.push('y');
    buf.push('z');
    expect(buf.getCount()).toBe(3);
  });

  it('[P1] getCapacity returns constructor capacity', () => {
    const buf = new RingBuffer<number>(7);
    expect(buf.getCapacity()).toBe(7);
  });

  it('[P1] clear resets count to 0 and toArray returns []', () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.clear();
    expect(buf.getCount()).toBe(0);
    expect(buf.toArray()).toEqual([]);
  });

  it('[P2] clear allows reuse after reset', () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.clear();
    buf.push(10);
    buf.push(20);
    expect(buf.getCount()).toBe(2);
    expect(buf.toArray()).toEqual([10, 20]);
  });

  it('[P2] single element operations are correct', () => {
    const buf = new RingBuffer<string>(5);
    buf.push('only');
    expect(buf.getCount()).toBe(1);
    expect(buf.toArray()).toEqual(['only']);
  });

  it('[P2] 100k ops without memory growth', () => {
    const buf = new RingBuffer<number>(10);
    for (let i = 0; i < 100_000; i++) {
      buf.push(i);
    }
    expect(buf.getCount()).toBe(10);
    const arr = buf.toArray();
    expect(arr.length).toBe(10);
    expect(arr[arr.length - 1]).toBe(99_999);
  });

  it('[P2] heavy overwrites maintain correct count', () => {
    const buf = new RingBuffer<number>(3);
    for (let i = 0; i < 100; i++) {
      buf.push(i);
    }
    expect(buf.getCount()).toBe(3);
  });

  it('[P2] preserves insertion order in returned array', () => {
    const buf = new RingBuffer<string>(3);
    buf.push('a');
    buf.push('b');
    buf.push('c');
    buf.push('d');
    expect(buf.toArray()).toEqual(['b', 'c', 'd']);
  });

  it('[P2] handles heterogeneous types', () => {
    const buf = new RingBuffer<number | string | boolean>(3);
    buf.push(1);
    buf.push('hello');
    buf.push(true);
    expect(buf.toArray()).toEqual([1, 'hello', true]);
  });
});
