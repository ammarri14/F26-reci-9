import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { mergeIntervals, type Interval } from '../src/intervals';

// Valid intervals by construction: start <= end. Small ranges so overlaps and
// shared endpoints (touching) happen often.
const interval: fc.Arbitrary<Interval> = fc
  .tuple(fc.integer({ min: -20, max: 20 }), fc.nat(6))
  .map(([s, len]): Interval => [s, s + len]);
const intervalList = fc.array(interval, { maxLength: 8 });

// Intervals that neither overlap nor touch: each next start is at least end + 1.
const disjointList = fc
  .array(fc.tuple(fc.integer({ min: 1, max: 4 }), fc.nat(4)), { maxLength: 6 })
  .map(parts => {
    const out: Interval[] = [];
    let pos = -20;
    for (const [gap, len] of parts) {
      const s = pos + gap;
      out.push([s, s + len]);
      pos = s + len;
    }
    return out;
  });

// Simple check: is point p inside any interval?
const covers = (xs: readonly Interval[], p: number) => xs.some(([s, e]) => s <= p && p <= e);

describe('mergeIntervals', () => {
  // Pattern: invariant. Every input interval lies inside some output interval.
  it('every input interval lies inside some output interval', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        const uncovered = xs.filter(([s, e]) => !out.some(([a, b]) => a <= s && e <= b));
        expect(uncovered).toEqual([]);
      }),
    );
  });

  // Pattern: invariant. The output is sorted and consecutive intervals neither overlap nor touch.
  it('output is sorted with gaps between intervals', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (const [s, e] of out) expect(s).toBeLessThanOrEqual(e);
        for (let i = 0; i + 1 < out.length; i++) expect(out[i][1]).toBeLessThan(out[i + 1][0]);
      }),
    );
  });

  // Pattern: invariant. The input array and its intervals are not modified.
  it('does not modify the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const copy = xs.map(([s, e]) => [s, e]);
        mergeIntervals(xs);
        expect(xs).toEqual(copy);
      }),
    );
  });

  // Pattern: differential. Input and output cover exactly the same points, including half points.
  it('covers the same points as the input', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const out = mergeIntervals(xs);
        for (let p = -22; p <= 28; p += 0.5) expect(covers(out, p)).toBe(covers(xs, p));
      }),
    );
  });

  // Pattern: metamorphic. Shuffling the input does not change the output.
  it('input order does not matter', () => {
    const listAndShuffle = intervalList.chain(xs =>
      fc.tuple(fc.constant(xs), fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length })),
    );
    fc.assert(
      fc.property(listAndShuffle, ([xs, ys]) => {
        expect(mergeIntervals(ys)).toEqual(mergeIntervals(xs));
      }),
    );
  });

  // Pattern: metamorphic. Adding a duplicate interval does not change the output.
  it('duplicates do not change the output', () => {
    fc.assert(
      fc.property(intervalList, interval, (xs, x) => {
        expect(mergeIntervals([...xs, x, x])).toEqual(mergeIntervals([...xs, x]));
      }),
    );
  });

  // Pattern: algebraic. Merging an already merged list changes nothing.
  it('is idempotent', () => {
    fc.assert(
      fc.property(intervalList, xs => {
        const once = mergeIntervals(xs);
        expect(mergeIntervals(once)).toEqual(once);
      }),
    );
  });

  // Pattern: conditional. If intervals neither overlap nor touch, the output is the sorted input.
  it('leaves separate intervals unchanged, just sorted', () => {
    const shuffled = disjointList.chain(xs =>
      fc.tuple(fc.constant(xs), fc.shuffledSubarray(xs, { minLength: xs.length, maxLength: xs.length })),
    );
    fc.assert(
      fc.property(shuffled, ([sorted, ys]) => {
        expect(mergeIntervals(ys)).toEqual(sorted);
      }),
    );
  });

  // Pattern: conditional. Two intervals that touch at one point merge into one.
  it('touching intervals merge', () => {
    fc.assert(
      fc.property(fc.integer({ min: -20, max: 20 }), fc.nat(5), fc.nat(5), (s, a, b) => {
        const m = s + a;
        expect(mergeIntervals([[s, m], [m, m + b]])).toEqual([[s, m + b]]);
      }),
    );
  });

  // Pattern: conditional. Invalid intervals throw a RangeError.
  it('rejects invalid intervals', () => {
    const bad = fc.oneof(
      fc.tuple(fc.integer({ min: -20, max: 20 }), fc.integer({ min: 1, max: 5 })).map(([s, d]): Interval => [s, s - d]),
      fc.tuple(fc.integer({ min: -20, max: 20 }), fc.constantFrom(0.5, 0.25)).map(([s, f]): Interval => [s + f, s + 2]),
      fc.tuple(fc.integer({ min: -20, max: 20 }), fc.constantFrom(0.5, 0.25)).map(([s, f]): Interval => [s, s + 2 + f]),
    );
    fc.assert(
      fc.property(intervalList, bad, (xs, b) => {
        expect(() => mergeIntervals([...xs, b])).toThrow(RangeError);
      }),
    );
  });

  // Pattern: conditional. An empty input gives an empty output.
  it('empty input gives empty output', () => {
    expect(mergeIntervals([])).toEqual([]);
  });
});
