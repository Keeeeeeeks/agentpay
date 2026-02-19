export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function pickFirst(value: unknown, keys: string[]): unknown {
  for (const key of keys) {
    const found = pickPath(value, key);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function pickPath(value: unknown, keyPath: string): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  const segments = keyPath.split(".");
  let current: unknown = value;
  for (const segment of segments) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function extractList(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  const candidates = [
    pickFirst(value, ["items"]),
    pickFirst(value, ["data"]),
    pickFirst(value, ["results"]),
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

export function stringify(value: unknown): string {
  if (value === null || value === undefined) {
    return "-";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "[]";
    }
    const primitives = value.every(
      (item) => typeof item === "string" || typeof item === "number" || typeof item === "boolean",
    );
    if (primitives) {
      return value.map((item) => String(item)).join(", ");
    }
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

export function toFlatRows(value: unknown, prefix = ""): Array<[string, string]> {
  if (!isRecord(value)) {
    return [[prefix || "value", stringify(value)]];
  }

  const rows: Array<[string, string]> = [];
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix.length > 0 ? `${prefix}.${key}` : key;
    if (isRecord(child)) {
      rows.push(...toFlatRows(child, fullKey));
      continue;
    }
    rows.push([fullKey, stringify(child)]);
  }
  return rows;
}

export function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }
  return parsed;
}

export function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : undefined;
}
