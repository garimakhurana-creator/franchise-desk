import defaultPolicy from "./policy.json";

export type Policy = typeof defaultPolicy;
export const DEFAULT_POLICY: Policy = defaultPolicy;

export function clonePolicy(p: Policy = DEFAULT_POLICY): Policy {
  return JSON.parse(JSON.stringify(p));
}

export const tierKey = (t: number) => String(t) as "1" | "2" | "3";

/** Set a nested policy value by dotted path, e.g. "bars.approval". Returns a new policy. */
export function setPolicyValue(p: Policy, path: string, value: number | string): Policy {
  const next = clonePolicy(p) as unknown as Record<string, unknown>;
  const parts = path.split(".");
  let cur = next as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] as Record<string, unknown>;
  cur[parts[parts.length - 1]] = value;
  return next as unknown as Policy;
}

export function getPolicyValue(p: Policy, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], p);
}
