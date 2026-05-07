import { trace, context as otelContext, SpanStatusCode, type Span, type Tracer } from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

/**
 * Bootstrap OpenTelemetry node SDK. Exports OTLP HTTP traces to
 * `OTEL_EXPORTER_OTLP_ENDPOINT` (Grafana Cloud Tempo, Honeycomb, ...) when
 * configured. When no endpoint is set we still install the SDK so spans
 * are recorded in-process, allowing `traceparent` propagation between
 * API → BullMQ → worker without a backend.
 *
 * Call `startTracing()` ONCE at the entrypoint of each app, before any
 * other module that creates spans imports. Returns the SDK so the caller
 * can `await sdk.shutdown()` on graceful exit.
 */
export interface TracingOptions {
  serviceName: string;
  serviceVersion?: string;
  endpoint?: string;
}

let sdk: NodeSDK | null = null;

export function startTracing(opts: TracingOptions): NodeSDK {
  if (sdk) return sdk;
  const endpoint = opts.endpoint ?? process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const traceExporter = endpoint ? new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }) : undefined;
  sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: opts.serviceName,
      [ATTR_SERVICE_VERSION]: opts.serviceVersion ?? '0.0.0',
    }),
    ...(traceExporter ? { traceExporter } : {}),
  });
  sdk.start();
  return sdk;
}

export function stopTracing(): Promise<void> {
  if (!sdk) return Promise.resolve();
  return sdk.shutdown();
}

export function getTracer(name: string): Tracer {
  return trace.getTracer(name);
}

/**
 * Run `fn` inside a new span with `name`. Records errors and re-throws.
 * Convenience for synchronous instrumentation around DB tx, HTTP fetches
 * and rule executions where we want one span per logical step.
 */
export async function withSpan<T>(
  tracer: Tracer,
  name: string,
  attrs: Record<string, string | number | boolean | undefined>,
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  const cleanedAttrs: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined) cleanedAttrs[k] = v;
  }
  return tracer.startActiveSpan(name, { attributes: cleanedAttrs }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      span.recordException(err instanceof Error ? err : new Error(msg));
      span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** Extract a W3C `traceparent` header string from the current context. */
export function currentTraceparent(): string | undefined {
  const span = trace.getActiveSpan();
  if (!span) return undefined;
  const ctx = span.spanContext();
  return `00-${ctx.traceId}-${ctx.spanId}-${ctx.traceFlags.toString(16).padStart(2, '0')}`;
}

export { otelContext, trace };
export type { Span, Tracer };
