const SENSITIVE_KEY = /private.?key|api.?key|authorization|cookie|signature|signed.?tx|token|secret|password/i;

function safeValue(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return value.length > 1000 ? `${value.slice(0, 1000)}…` : value;
  if (typeof value !== 'object') return String(value);
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      code: (value as Error & { code?: unknown }).code,
    };
  }
  if (seen.has(value)) return '[Circular]';
  if (depth >= 4) return '[Max depth]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => safeValue(item, depth + 1, seen));
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
    output[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : safeValue(item, depth + 1, seen);
  }
  return output;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Unknown browser error';
}

export function reportClientError(kind: string, error: unknown, context?: Record<string, unknown>) {
  if (!import.meta.env.DEV) return;
  const report = {
    kind,
    message: errorMessage(error),
    error: safeValue(error),
    context: safeValue(context),
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
  };
  void fetch('/api/dev/client-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(report),
    keepalive: true,
  }).catch(() => undefined);
}

if (import.meta.env.DEV) {
  const originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    originalConsoleError(...args);
    reportClientError('console.error', args[0], { arguments: args });
  };

  window.addEventListener('error', (event) => {
    reportClientError('window.error', event.error || event.message, {
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError('unhandledrejection', event.reason);
  });
}
