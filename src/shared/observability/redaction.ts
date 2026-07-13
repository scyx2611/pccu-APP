const REDACTED = '[Redacted]';
const CIRCULAR = '[Circular]';
const SENSITIVE_KEY = /(account|password|credential|cookie|html|payload)/i;

const sanitizeUrl = (value: string): string => {
  if (!/^https?:\/\//i.test(value)) return value;

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname}`;
  } catch {
    return '[Invalid URL]';
  }
};

const visit = (value: unknown, ancestors: WeakSet<object>): unknown => {
  if (typeof value === 'string') return sanitizeUrl(value);
  if (value === null || typeof value !== 'object') return value;

  if (ancestors.has(value)) return CIRCULAR;
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      return value.map((item) => visit(item, ancestors));
    }

    if (value instanceof Error) {
      return { name: value.name || 'Error' };
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : visit(child, ancestors),
      ]),
    );
  } finally {
    ancestors.delete(value);
  }
};

export const redactLogValue = (value: unknown): unknown => visit(value, new WeakSet<object>());
