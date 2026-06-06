# Banking APIs with OgerJS

Guide for REST + WebSocket banking-style services on Bun (and Node via `FORCE_NODE_COMPAT`). Uses workspace plugins only — no extra runtime npm deps in `@ogerjs/*`.

## Stack map

| Need | Package |
|------|---------|
| JWT auth | `@ogerjs/jwt`, `@ogerjs/bearer` |
| API key (service accounts) | `@ogerjs/api-key` |
| Idempotent POST | `@ogerjs/idempotency` |
| RFC 7807 errors | `@ogerjs/core` (`problemDetailsResponse`) |
| Request tracing | `@ogerjs/request-id` |
| Audit trail + PII redaction | `@ogerjs/audit-log`, `@ogerjs/logger` |
| Rate limit | `@ogerjs/rate-limit` |
| Security headers | `@ogerjs/helmet` |
| CORS / CSRF | `@ogerjs/cors`, `@ogerjs/csrf` |
| Body limits | `@ogerjs/body-limit` |
| WebSocket router | `@ogerjs/ws` |
| Health | `@ogerjs/health` |
| Route registry → OpenAPI | `@ogerjs/core` `routeRegistry` |

## Reference app

`apps/example-banking` demonstrates:

- `POST /auth/login` — JWT issuance
- `GET /accounts`, `GET /accounts/:id` — balances (JWT guard)
- `POST /transfers` — **idempotent** ledger move (`Idempotency-Key` header)
- `GET /openapi.json` — registry export
- `GET /ws/notifications` — WebSocket upgrade with JWT (`?token=` or `Authorization`)
- Global: request ID, structured logging, rate limit, helmet, audit events

```bash
bun install
bun run --cwd apps/example-banking start    # http://localhost:3002
bun test apps/example-banking               # inject() smoke tests
```

## REST patterns

### Idempotent transfers

```ts
import { idempotency } from "@ogerjs/idempotency";

app.use(idempotency());

app.post("/transfers", handler, {
  jwt: true,
  body: t.Object({ fromAccountId: t.String(), toAccountId: t.String(), amountCents: t.Number() }),
});
```

Clients send `Idempotency-Key: <uuid>` on `POST`. Replays return cached body with `Idempotent-Replayed: true`.

Swap `createMemoryIdempotencyStore()` for Redis/SQLite in production.

### Structured errors

```ts
import { problemDetailsResponse } from "@ogerjs/core";

return problemDetailsResponse({
  title: "Transfer Failed",
  status: 400,
  detail: "Insufficient balance",
  code: "INSUFFICIENT_FUNDS",
});
```

### Audit + request ID

```ts
import { requestId } from "@ogerjs/request-id";
import { auditLog } from "@ogerjs/audit-log";

app.use(requestId());
app.use(auditLog({ sink: mySink }));

app.post("/transfers", (ctx) => {
  ctx.audit({
    type: "data",
    action: "transfer.create",
    success: true,
    subject: ctx.jwt.sub,
    metadata: { amountCents: 1000 },
  });
});
```

Metadata is auto-redacted (`password`, `token`, `apiKey`, etc.) via `@ogerjs/logger`.

## WebSocket notifications

Pair `createWebSocketHandlers` with an HTTP upgrade route:

```ts
import { createWebSocketHandlers, TopicPubSub } from "@ogerjs/ws";
import { verifyJwt } from "@ogerjs/jwt";

const pubsub = new TopicPubSub();

const wsHandlers = createWebSocketHandlers({
  handlers: {
    open(ws) {
      const userId = ws.data.userId;
      pubsub.subscribe(`user:${userId}`, ws);
    },
    message(ws, msg) {
      if (msg === "ping") ws.send("pong");
    },
    close(ws) {
      pubsub.unsubscribeAll(ws);
    },
  },
});

app.get("/ws/notifications", async (ctx) => {
  const token = ctx.query.token ?? ctx.headers.authorization?.replace(/^Bearer\s+/i, "");
  const payload = await verifyJwt(token, SECRET);
  if (!payload?.sub) return problemDetailsResponse({ title: "Unauthorized", status: 401 });

  ctx.server?.upgrade(ctx.request, { data: { userId: payload.sub } });
});

app.listen({ port: 3002, websocket: wsHandlers });
```

After a transfer, publish balance updates:

```ts
pubsub.publish(`user:${owner}`, JSON.stringify({ type: "balance.updated", accountId, balanceCents }));
```

## Data layer

Example uses in-memory `BankingStore`. For production:

- **Bun**: `bun:sqlite` or `@ogerjs/compat` `Database` wrapper (Bun + `better-sqlite3` on Node)
- **Postgres**: `node:pg` or Bun SQL — wrap transfers in explicit transactions
- **Outbox**: see `@ogerjs/events` interfaces for async notification relay

Document transactional boundaries in app code; core does not wrap ORM transactions.

## Node parity

Set `FORCE_NODE_COMPAT=1` to use Node `http`/`https` fallback from `@ogerjs/core`.

- REST + plugins: same `app.use()` stack
- WebSocket: requires optional `ws` package on Node (devDependency at app level, not in `@ogerjs/core`)
- TLS: pass `listen({ tls: { cert, key } })`

## Production checklist

- [ ] Strong `JWT_SECRET` via env (never log)
- [ ] Persistent idempotency + ledger store
- [ ] IP allowlist / mTLS at reverse proxy or custom `beforeHandle`
- [ ] Distributed rate limits (Redis adapter — interface TBD)
- [ ] CSRF for browser sessions; API clients use JWT/API key only
- [ ] `@ogerjs/readiness` env/TLS audit before deploy

## Gap vs full banking platform

Still partial or missing in-repo: mTLS hooks, IP filter plugin, distributed idempotency, OpenAPI UI package, Postgres adapter, persisted audit sink, WebSocket auth middleware in `@ogerjs/ws`, cron/outbox workers. See `docs/ENTERPRISE_ROADMAP.md`.
