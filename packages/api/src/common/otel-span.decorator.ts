import { trace, SpanStatusCode } from '@opentelemetry/api';

/**
 * Decorator that wraps a method in an OpenTelemetry span.
 * Usage: @TraceSpan('sandbox.create') on any async method.
 */
export function TraceSpan(spanName: string) {
  return function (
    _target: any,
    _propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const original = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const tracer = trace.getTracer('quarkbox-api');
      return tracer.startActiveSpan(spanName, async (span) => {
        try {
          const result = await original.apply(this, args);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error: any) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
          span.recordException(error);
          throw error;
        } finally {
          span.end();
        }
      });
    };

    return descriptor;
  };
}
