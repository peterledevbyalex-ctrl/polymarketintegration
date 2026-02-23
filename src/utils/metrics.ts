import client from 'prom-client';
import logger from './logger';

// Create a Registry to register the metrics
export const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
export const intentMetrics = {
  created: new client.Counter({
    name: 'intents_created_total',
    help: 'Total number of intents created',
    labelNames: ['outcome'],
    registers: [register],
  }),

  stateTransitions: new client.Counter({
    name: 'intent_state_transitions_total',
    help: 'Total number of state transitions',
    labelNames: ['from_state', 'to_state'],
    registers: [register],
  }),

  duration: new client.Histogram({
    name: 'intent_duration_seconds',
    help: 'Time from creation to completion',
    labelNames: ['final_state'],
    buckets: [1, 5, 10, 30, 60, 120, 300],
    registers: [register],
  }),

  relayExecutionTime: new client.Histogram({
    name: 'relay_execution_time_seconds',
    help: 'Time from origin tx to relay execution',
    buckets: [1, 5, 10, 30, 60],
    registers: [register],
  }),

  orderPlacementTime: new client.Histogram({
    name: 'order_placement_time_seconds',
    help: 'Time from funding to order placement',
    buckets: [0.5, 1, 2, 5, 10],
    registers: [register],
  }),

  apiCalls: new client.Counter({
    name: 'api_calls_total',
    help: 'Total API calls',
    labelNames: ['service', 'method', 'status'],
    registers: [register],
  }),

  apiLatency: new client.Histogram({
    name: 'api_latency_seconds',
    help: 'API call latency',
    labelNames: ['service', 'method'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
    registers: [register],
  }),

  errors: new client.Counter({
    name: 'errors_total',
    help: 'Total errors',
    labelNames: ['type', 'service'],
    registers: [register],
  }),
};

// Track intent creation
export function trackIntentCreated(outcome: string): void {
  intentMetrics.created.inc({ outcome });
}

// Track state transition
export function trackStateTransition(from: string, to: string): void {
  intentMetrics.stateTransitions.inc({ from_state: from, to_state: to });
}

// Track intent duration
export function trackIntentDuration(finalState: string, durationSeconds: number): void {
  intentMetrics.duration.observe({ final_state: finalState }, durationSeconds);
}

// Track API call
export function trackApiCall(
  service: string,
  method: string,
  status: string,
  latencySeconds: number
): void {
  intentMetrics.apiCalls.inc({ service, method, status });
  intentMetrics.apiLatency.observe({ service, method }, latencySeconds);
}

// Track error
export function trackError(type: string, service: string): void {
  intentMetrics.errors.inc({ type, service });
}

// Get metrics as string
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

// Only log if logger is available (skip in test environment)
if (logger && typeof logger.info === 'function') {
  logger.info('Prometheus metrics initialized');
}
