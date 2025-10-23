/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Deep structural comparison that "just works" on primitives too.
 * @public
 */
export function deepEqual(
  a: unknown,
  b: unknown,
  seen = new WeakMap<object, object>(),
): boolean {
  // 1. Fast‑path for strict equality – catches most primitives & identical references.
  if (a === b) {
    // Distinguish +0 and –0 (JS treats them as equal but spec says they’re not “SameValue”)
    return a !== 0 || 1 / (a as number) === 1 / (b as number);
  }

  // 2. Handle the one primitive pair that fails `===`: NaN
  if (Number.isNaN(a) && Number.isNaN(b)) return true;

  // 3. If types differ (and neither is null/undefined), we’re already unequal.
  const ta = typeof a,
    tb = typeof b;
  if (ta !== tb) return false;
  if (ta !== 'object' && ta !== 'function') return false; // all remaining primitives handled above

  // 4. Null is `object` in JS but can’t be equal to anything reached here.
  if (a === null || b === null) return false;

  // 5. Protect against cycles (A↔B, etc.)
  if (seen.get(a as object) === b) return true;
  seen.set(a as object, b as object);

  /** Helper used below */
  const eq = (x: unknown, y: unknown) => deepEqual(x, y, seen);

  // ========== Built‑ins with bespoke semantics ==========
  if (a instanceof Date || b instanceof Date)
    return (
      a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
    );

  if (a instanceof RegExp || b instanceof RegExp)
    return (
      a instanceof RegExp &&
      b instanceof RegExp &&
      a.source === b.source &&
      a.flags === b.flags
    );

  if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
    if (!(ArrayBuffer.isView(a) && ArrayBuffer.isView(b))) return false;
    if ((a as ArrayBufferView).byteLength !== (b as ArrayBufferView).byteLength)
      return false;
    // DataView covers every TypedArray behind the scenes
    const dvA = new DataView(
      (a as ArrayBufferView).buffer,
      (a as ArrayBufferView).byteOffset,
    );
    const dvB = new DataView(
      (b as ArrayBufferView).buffer,
      (b as ArrayBufferView).byteOffset,
    );
    for (let i = 0; i < dvA.byteLength; i++) {
      if (dvA.getUint8(i) !== dvB.getUint8(i)) return false;
    }
    return true;
  }

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false;
    return true;
  }

  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set) || a.size !== b.size)
      return false;
    outer: for (const va of a) {
      for (const vb of b) if (eq(va, vb)) continue outer;
      return false; // no match found
    }
    return true;
  }

  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map) || a.size !== b.size)
      return false;
    outer: for (const [ka, va] of a) {
      for (const [kb, vb] of b) {
        if (eq(ka, kb) && eq(va, vb)) continue outer;
      }
      return false;
    }
    return true;
  }

  // ========== Plain objects + class instances (prototype doesn’t matter) ==========
  const keysA = Reflect.ownKeys(a as object);
  const keysB = Reflect.ownKeys(b as object);
  if (keysA.length !== keysB.length) return false;

  for (const k of keysA) {
    if (!keysB.includes(k) || !eq((a as any)[k], (b as any)[k])) return false;
  }
  return true;
}
