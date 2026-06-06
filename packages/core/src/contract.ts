/** Contract-first vs handler-first API modes (Phase 2 scaffold). */

export type ApiContractMode = "handler-first" | "contract-first";

export interface ContractModeConfig {
	/** Default: `handler-first` — schemas inferred from handlers; `contract-first` checks contracts at build. */
	mode?: ApiContractMode;
}

/** Opaque contract handle — wire build-time validation in Phase 2. */
export interface RouteContract<_THandlers = unknown> {
	readonly __contract?: unique symbol;
}

/** Declare a route contract separate from handlers (no-op until build checker lands). */
export function defineContract<T>(_definition: T): RouteContract<T> {
	return {};
}

/** Build-time hook placeholder — validates handler coverage against contracts. */
export function assertContractHandlers(
	_routes: unknown,
	_contracts: unknown,
): void {
	/* Phase 2 */
}
