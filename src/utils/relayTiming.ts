import logger from './logger';

interface RelayTimingData {
  intentId: string;
  // Quote phase
  quoteRequestedAt?: number;
  quoteReceivedAt?: number;
  quoteDurationMs?: number;
  
  // User signing phase (client-side, we just measure the gap)
  quoteReturnedToClientAt?: number;
  originTxSubmittedAt?: number;
  userSigningDurationMs?: number;
  
  // Bridge execution phase
  bridgeStartedAt?: number;  // When origin tx confirmed
  bridgeCompletedAt?: number; // When dest funds arrived
  bridgeExecutionDurationMs?: number;
  
  // Polling stats
  pollCount?: number;
  firstPollAt?: number;
  lastPollAt?: number;
  
  // Summary
  totalRelayDurationMs?: number;  // Quote + Bridge (excludes user signing)
  totalE2EDurationMs?: number;    // Everything including user signing
}

// In-memory store for timing data (per intent)
// Exported for internal use only
export const timingStore = new Map<string, RelayTimingData>();

export function startRelayTiming(intentId: string): void {
  timingStore.set(intentId, {
    intentId,
    quoteRequestedAt: Date.now(),
  });
}

export function markQuoteReceived(intentId: string): void {
  const data = timingStore.get(intentId);
  if (data) {
    data.quoteReceivedAt = Date.now();
    data.quoteDurationMs = data.quoteReceivedAt - (data.quoteRequestedAt || data.quoteReceivedAt);
    data.quoteReturnedToClientAt = data.quoteReceivedAt; // Same for now
  }
}

export function markOriginTxSubmitted(intentId: string): void {
  const data = timingStore.get(intentId);
  if (data) {
    data.originTxSubmittedAt = Date.now();
    data.bridgeStartedAt = data.originTxSubmittedAt;
    if (data.quoteReturnedToClientAt) {
      data.userSigningDurationMs = data.originTxSubmittedAt - data.quoteReturnedToClientAt;
    }
  }
}

export function markPollAttempt(intentId: string): void {
  const data = timingStore.get(intentId);
  if (data) {
    const now = Date.now();
    if (!data.firstPollAt) {
      data.firstPollAt = now;
    }
    data.lastPollAt = now;
    data.pollCount = (data.pollCount || 0) + 1;
  }
}

export function markBridgeCompleted(intentId: string): void {
  const data = timingStore.get(intentId);
  if (data) {
    data.bridgeCompletedAt = Date.now();
    if (data.bridgeStartedAt) {
      data.bridgeExecutionDurationMs = data.bridgeCompletedAt - data.bridgeStartedAt;
    }
    
    // Calculate totals
    if (data.quoteDurationMs && data.bridgeExecutionDurationMs) {
      data.totalRelayDurationMs = data.quoteDurationMs + data.bridgeExecutionDurationMs;
    }
    if (data.quoteRequestedAt) {
      data.totalE2EDurationMs = data.bridgeCompletedAt - data.quoteRequestedAt;
    }
    
    // Output the final timing report
    outputRelayTimingReport(intentId);
  }
}

export function outputRelayTimingReport(intentId: string): void {
  const data = timingStore.get(intentId);
  if (!data) {
    logger.warn('No timing data found for intent', { intentId });
    return;
  }

  const report = {
    _type: 'RELAY_TIMING_REPORT',
    intentId: data.intentId,
    timestamp: new Date().toISOString(),
    
    phases: {
      quote: {
        durationMs: data.quoteDurationMs || null,
        durationSec: data.quoteDurationMs ? (data.quoteDurationMs / 1000).toFixed(2) : null,
      },
      userSigning: {
        durationMs: data.userSigningDurationMs || null,
        durationSec: data.userSigningDurationMs ? (data.userSigningDurationMs / 1000).toFixed(2) : null,
        note: 'Client-side, not Relay responsibility',
      },
      bridgeExecution: {
        durationMs: data.bridgeExecutionDurationMs || null,
        durationSec: data.bridgeExecutionDurationMs ? (data.bridgeExecutionDurationMs / 1000).toFixed(2) : null,
        pollCount: data.pollCount || 0,
      },
    },
    
    totals: {
      relayOnly: {
        durationMs: data.totalRelayDurationMs || null,
        durationSec: data.totalRelayDurationMs ? (data.totalRelayDurationMs / 1000).toFixed(2) : null,
        breakdown: 'quote + bridgeExecution (what Relay controls)',
      },
      endToEnd: {
        durationMs: data.totalE2EDurationMs || null,
        durationSec: data.totalE2EDurationMs ? (data.totalE2EDurationMs / 1000).toFixed(2) : null,
        breakdown: 'quote + userSigning + bridgeExecution',
      },
    },
    
    // Raw timestamps for verification
    timestamps: {
      quoteRequested: data.quoteRequestedAt ? new Date(data.quoteRequestedAt).toISOString() : null,
      quoteReceived: data.quoteReceivedAt ? new Date(data.quoteReceivedAt).toISOString() : null,
      originTxSubmitted: data.originTxSubmittedAt ? new Date(data.originTxSubmittedAt).toISOString() : null,
      bridgeCompleted: data.bridgeCompletedAt ? new Date(data.bridgeCompletedAt).toISOString() : null,
    },
  };

  // Log as structured JSON
  logger.info('RELAY_TIMING_REPORT', report);
  
  // Also output to console for easy extraction
  console.log('\n========== RELAY TIMING REPORT ==========');
  console.log(JSON.stringify(report, null, 2));
  console.log('==========================================\n');
}

export function getRelayTiming(intentId: string): RelayTimingData | undefined {
  return timingStore.get(intentId);
}

// Clean up old timing data (call periodically)
export function cleanupOldTimings(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [intentId, data] of timingStore.entries()) {
    const startTime = data.quoteRequestedAt || 0;
    if (now - startTime > maxAgeMs) {
      timingStore.delete(intentId);
    }
  }
}
