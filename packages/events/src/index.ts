export interface DomainEvent<
	TType extends string = string,
	TPayload = unknown,
> {
	type: TType;
	payload: TPayload;
	occurredAt: number;
	id: string;
}

export interface EventBusAdapter {
	publish<T>(
		channel: string,
		event: DomainEvent<string, T>,
	): Promise<void> | void;
	subscribe<T>(
		channel: string,
		handler: (event: DomainEvent<string, T>) => void | Promise<void>,
	): () => void;
}

/** Typed domain event factory with inference on `type`. */
export function defineDomainEvent<TType extends string, TPayload>() {
	return (type: TType, payload: TPayload): DomainEvent<TType, TPayload> => ({
		type,
		payload,
		occurredAt: Date.now(),
		id: crypto.randomUUID(),
	});
}

/** In-memory event bus — swap adapter for Redis/Postgres later. */
export function createInMemoryEventBus(): EventBusAdapter {
	const channels = new Map<
		string,
		Set<(event: DomainEvent<string, unknown>) => void | Promise<void>>
	>();

	return {
		publish(channel, event) {
			const handlers = channels.get(channel);
			if (!handlers) return;
			for (const handler of handlers) void handler(event);
		},
		subscribe(channel, handler) {
			let set = channels.get(channel);
			if (!set) {
				set = new Set();
				channels.set(channel, set);
			}
			set.add(handler as (event: DomainEvent<string, unknown>) => void);
			return () =>
				set?.delete(handler as (event: DomainEvent<string, unknown>) => void);
		},
	};
}

export interface OutboxEntry<T = unknown> {
	id: string;
	channel: string;
	event: DomainEvent<string, T>;
	createdAt: number;
	publishedAt?: number;
}

/** Transactional outbox scaffold (persist + relay in Phase 3). */
export class Outbox {
	private readonly pending: OutboxEntry[] = [];

	add<T>(channel: string, event: DomainEvent<string, T>): OutboxEntry<T> {
		const entry: OutboxEntry<T> = {
			id: crypto.randomUUID(),
			channel,
			event,
			createdAt: Date.now(),
		};
		this.pending.push(entry as OutboxEntry);
		return entry;
	}

	drainUnpublished(): OutboxEntry[] {
		const batch = this.pending.filter((e) => !e.publishedAt);
		for (const entry of batch) entry.publishedAt = Date.now();
		return batch;
	}
}
