export function decideWrite(input: {
  existingByIdentity: boolean;
  existingByUrl: boolean;
  suppressed: boolean;
}): { action: "insert" | "update" | "skip"; keepInactive: boolean } {
  if (input.suppressed) {
    if (input.existingByIdentity) return { action: "update", keepInactive: true };
    return { action: "skip", keepInactive: true };
  }
  if (input.existingByIdentity || input.existingByUrl) {
    return { action: "update", keepInactive: false };
  }
  return { action: "insert", keepInactive: false };
}

export function nextLifecycle(input: {
  seen: boolean;
  sourceOk: boolean;
  missCount: number;
}): { missCount: number; lifecycle: "active" | "stale" | "closed"; active: boolean } {
  if (input.seen) return { missCount: 0, lifecycle: "active", active: true };
  if (!input.sourceOk) {
    return { missCount: input.missCount, lifecycle: "active", active: true };
  }
  const missCount = input.missCount + 1;
  if (missCount >= 2) return { missCount, lifecycle: "closed", active: false };
  return { missCount, lifecycle: "stale", active: true };
}
