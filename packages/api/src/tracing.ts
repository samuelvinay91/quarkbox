/**
 * OpenTelemetry instrumentation for QuarkBox API.
 * Must be loaded BEFORE NestJS bootstrap (import at top of main.ts).
 *
 * SOC2 CC7.1 — System monitoring and anomaly detection.
 *
 * Environment variables:
 *   OTEL_ENABLED=true          — Enable tracing (default: false)
 *   OTEL_EXPORTER_ENDPOINT     — OTLP HTTP endpoint (default: http://localhost:4318)
 *   OTEL_SERVICE_NAME          — Service name (default: quarkbox-api)
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';

const otelEnabled = process.env.OTEL_ENABLED === 'true';

if (otelEnabled) {
  // Enable diagnostic logging in development
  if (process.env.NODE_ENV !== 'production') {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
  }

  const exporterEndpoint =
    process.env.OTEL_EXPORTER_ENDPOINT || 'http://localhost:4318';

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || 'quarkbox-api',
    [ATTR_SERVICE_VERSION]: '0.1.0',
    'deployment.environment': process.env.NODE_ENV || 'development',
  });

  const traceExporter = new OTLPTraceExporter({
    url: `${exporterEndpoint}/v1/traces`,
  });

  const metricExporter = new OTLPMetricExporter({
    url: `${exporterEndpoint}/v1/metrics`,
  });

  const metricReader = new PeriodicExportingMetricReader({
    exporter: metricExporter,
    exportIntervalMillis: 30000, // Export metrics every 30s
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    metricReader,
    instrumentations: [
      new HttpInstrumentation({
        ignoreIncomingRequestHook: (req) => {
          // Don't trace health checks to reduce noise
          return req.url === '/api/health';
        },
      }),
      new NestInstrumentation(),
    ],
  });

  sdk.start();

  // Graceful shutdown
  const shutdown = async () => {
    try {
      await sdk.shutdown();
      console.log('OpenTelemetry SDK shut down successfully');
    } catch (err) {
      console.error('Error shutting down OpenTelemetry SDK:', err);
    }
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  console.log(`[OTEL] Tracing enabled → ${exporterEndpoint}`);
} else {
  console.log('[OTEL] Tracing disabled (set OTEL_ENABLED=true to enable)');
}

export {};
