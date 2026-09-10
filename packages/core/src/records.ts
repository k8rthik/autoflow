/** Small immutable helpers over plain records. */

export const withoutKey = <V>(record: Readonly<Record<string, V>>, key: string): Readonly<Record<string, V>> =>
  Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));

export const withoutKeys = <V>(record: Readonly<Record<string, V>>, keys: ReadonlySet<string>): Readonly<Record<string, V>> =>
  Object.fromEntries(Object.entries(record).filter(([k]) => !keys.has(k)));

export const mapValues = <V>(record: Readonly<Record<string, V>>, fn: (value: V) => V): Readonly<Record<string, V>> =>
  Object.fromEntries(Object.entries(record).map(([k, v]) => [k, fn(v)]));
