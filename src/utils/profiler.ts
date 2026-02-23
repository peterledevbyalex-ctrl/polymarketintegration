import logger from './logger';

interface StepTiming {
  step: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
}

interface ProfileResult {
  operation: string;
  intentId?: string;
  totalDurationMs: number;
  steps: Array<{
    step: string;
    durationMs: number;
    percentOfTotal: number;
  }>;
  timestamp: string;
}

/**
 * Profiler for tracking step-by-step timing of operations.
 * Outputs JSON for analysis.
 */
export class Profiler {
  private operation: string;
  private intentId?: string;
  private startTime: number;
  private steps: StepTiming[] = [];
  private currentStep?: StepTiming;

  constructor(operation: string, intentId?: string) {
    this.operation = operation;
    this.intentId = intentId;
    this.startTime = Date.now();
  }

  /**
   * Start timing a step
   */
  startStep(stepName: string): void {
    // End previous step if any
    if (this.currentStep && !this.currentStep.endMs) {
      this.endStep();
    }

    this.currentStep = {
      step: stepName,
      startMs: Date.now(),
    };
  }

  /**
   * End the current step
   */
  endStep(): void {
    if (this.currentStep) {
      this.currentStep.endMs = Date.now();
      this.currentStep.durationMs = this.currentStep.endMs - this.currentStep.startMs;
      this.steps.push(this.currentStep);
      this.currentStep = undefined;
    }
  }

  /**
   * Time an async operation
   */
  async timeStep<T>(stepName: string, fn: () => Promise<T>): Promise<T> {
    this.startStep(stepName);
    try {
      const result = await fn();
      this.endStep();
      return result;
    } catch (error) {
      this.endStep();
      throw error;
    }
  }

  /**
   * Set the intent ID (if not known at construction)
   */
  setIntentId(intentId: string): void {
    this.intentId = intentId;
  }

  /**
   * Finish profiling and get results
   */
  finish(): ProfileResult {
    // End any in-progress step
    if (this.currentStep && !this.currentStep.endMs) {
      this.endStep();
    }

    const totalDurationMs = Date.now() - this.startTime;

    const result: ProfileResult = {
      operation: this.operation,
      intentId: this.intentId,
      totalDurationMs,
      steps: this.steps.map(s => ({
        step: s.step,
        durationMs: s.durationMs || 0,
        percentOfTotal: totalDurationMs > 0 
          ? Math.round(((s.durationMs || 0) / totalDurationMs) * 100) 
          : 0,
      })),
      timestamp: new Date().toISOString(),
    };

    // Log as JSON
    logger.info('PROFILE_RESULT', { profile: result });

    return result;
  }

  /**
   * Get current elapsed time
   */
  elapsed(): number {
    return Date.now() - this.startTime;
  }
}

/**
 * Create a new profiler for an operation
 */
export function createProfiler(operation: string, intentId?: string): Profiler {
  return new Profiler(operation, intentId);
}
