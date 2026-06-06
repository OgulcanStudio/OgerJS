export interface Account {
	id: string;
	owner: string;
	balanceCents: number;
	currency: string;
}

export interface Transfer {
	id: string;
	fromAccountId: string;
	toAccountId: string;
	amountCents: number;
	idempotencyKey?: string;
	createdAt: string;
}

/** In-memory ledger for demo — swap for SQLite/Postgres in production. */
export class BankingStore {
	private readonly accounts = new Map<string, Account>();
	private readonly transfers = new Map<string, Transfer>();

	constructor(seed?: Account[]) {
		for (const account of seed ?? defaultAccounts()) {
			this.accounts.set(account.id, { ...account });
		}
	}

	listAccounts(): Account[] {
		return [...this.accounts.values()];
	}

	getAccount(id: string): Account | undefined {
		const account = this.accounts.get(id);
		return account ? { ...account } : undefined;
	}

	transfer(input: {
		fromAccountId: string;
		toAccountId: string;
		amountCents: number;
		idempotencyKey?: string;
	}): Transfer {
		if (input.amountCents <= 0) {
			throw new TransferError("INVALID_AMOUNT", "Amount must be positive");
		}
		const from = this.accounts.get(input.fromAccountId);
		const to = this.accounts.get(input.toAccountId);
		if (!from || !to) {
			throw new TransferError("ACCOUNT_NOT_FOUND", "Account not found");
		}
		if (from.balanceCents < input.amountCents) {
			throw new TransferError("INSUFFICIENT_FUNDS", "Insufficient balance");
		}

		from.balanceCents -= input.amountCents;
		to.balanceCents += input.amountCents;

		const transfer: Transfer = {
			id: crypto.randomUUID(),
			fromAccountId: input.fromAccountId,
			toAccountId: input.toAccountId,
			amountCents: input.amountCents,
			idempotencyKey: input.idempotencyKey,
			createdAt: new Date().toISOString(),
		};
		this.transfers.set(transfer.id, transfer);
		return { ...transfer };
	}
}

export class TransferError extends Error {
	constructor(
		readonly code: string,
		message: string,
	) {
		super(message);
		this.name = "TransferError";
	}
}

function defaultAccounts(): Account[] {
	return [
		{ id: "acct-checking", owner: "alice", balanceCents: 250_000, currency: "USD" },
		{ id: "acct-savings", owner: "alice", balanceCents: 1_000_000, currency: "USD" },
		{ id: "acct-ops", owner: "bank", balanceCents: 10_000_000, currency: "USD" },
	];
}
