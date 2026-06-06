import type { RateLimitOptions } from "./index";

export interface SuspicionEvent {
	kind: "not_found" | "auth_failure" | "bad_ua" | "burst";
	weight?: number;
}

export interface AdaptiveLimiterOptions {
	/** Base limit passed to the underlying bucket. */
	baseMax: number;
	windowMs?: number;
	/** Score threshold before tightening (default 10). */
	tightenThreshold?: number;
	/** Multiplier applied to max when tightened (default 0.25 → 25% of base). */
	tightenFactor?: number;
	/** Decay suspicion score per window (default: halve each window). */
	decayFactor?: number;
}

interface KeyState {
	score: number;
	bucket: { count: number; resetAt: number };
	tightened: boolean;
}

/**
 * Tracks per-key suspicion and returns an effective max for rate limiting.
 */
export class AdaptiveLimiter {
	readonly windowMs: number;
	private readonly baseMax: number;
	private readonly tightenThreshold: number;
	private readonly tightenFactor: number;
	private readonly decayFactor: number;
	private readonly states = new Map<string, KeyState>();

	constructor(options: AdaptiveLimiterOptions) {
		this.baseMax = options.baseMax;
		this.windowMs = options.windowMs ?? 60_000;
		this.tightenThreshold = options.tightenThreshold ?? 10;
		this.tightenFactor = options.tightenFactor ?? 0.25;
		this.decayFactor = options.decayFactor ?? 0.5;
	}

	recordSuspicion(key: string, event: SuspicionEvent): void {
		const weight =
			event.weight ??
			(event.kind === "burst" ? 3 : event.kind === "auth_failure" ? 2 : 1);
		const state = this.getOrCreate(key);
		state.score += weight;
		state.tightened = state.score >= this.tightenThreshold;
	}

	/** Consume one request; returns whether allowed and header hints. */
	consume(key: string): {
		allowed: boolean;
		max: number;
		remaining: number;
		resetAt: number;
		tightened: boolean;
		score: number;
	} {
		const state = this.getOrCreate(key);
		const now = Date.now();

		if (now >= state.bucket.resetAt) {
			state.bucket = { count: 0, resetAt: now + this.windowMs };
			state.score *= this.decayFactor;
			if (state.score < this.tightenThreshold) state.tightened = false;
		}

		const max = state.tightened
			? Math.max(1, Math.floor(this.baseMax * this.tightenFactor))
			: this.baseMax;

		state.bucket.count += 1;
		const remaining = Math.max(0, max - state.bucket.count);

		return {
			allowed: state.bucket.count <= max,
			max,
			remaining,
			resetAt: state.bucket.resetAt,
			tightened: state.tightened,
			score: state.score,
		};
	}

	private getOrCreate(key: string): KeyState {
		let state = this.states.get(key);
		if (!state) {
			state = {
				score: 0,
				tightened: false,
				bucket: { count: 0, resetAt: Date.now() + this.windowMs },
			};
			this.states.set(key, state);
		}
		return state;
	}
}

export type AdaptiveRateLimitOptions = RateLimitOptions & {
	adaptive?: AdaptiveLimiterOptions | true;
	/** Auto-record suspicion on 404 responses. Default: true when adaptive enabled. */
	trackNotFound?: boolean;
};

export function createAdaptiveLimiter(
	options: AdaptiveRateLimitOptions,
): AdaptiveLimiter {
	const adaptive =
		options.adaptive === true
			? { baseMax: options.max, windowMs: options.windowMs }
			: {
					baseMax: options.max,
					windowMs: options.windowMs,
					...options.adaptive,
				};
	return new AdaptiveLimiter(adaptive);
}
