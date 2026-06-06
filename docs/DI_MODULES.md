# Dependency Injection & Modules

OgerJS provides a lightweight DI container and optional module/controller system for organizing larger applications.

## DI Container

### Creating a Container

```ts
import { createContainer, type Container, type Token } from "@ogerjs/core";

const DB = Symbol("db");
const Config = Symbol("config");

const container: Container = createContainer();
```

### Container Interface

```ts
interface Container {
  register<T>(token: Token<T>, value: T, options?: RegisterOptions): void;
  registerFactory<T>(
    token: Token<T>,
    factory: (container: Container) => T,
    options?: RegisterOptions,
  ): void;
  resolve<T>(token: Token<T>): T;
  has(token: Token): boolean;
  override<T>(token: Token<T>, value: T): void;
  createRequestScope(): Container;
}
```

`Token<T>` is `symbol | string`. Use symbols to avoid collisions.

### Register & Resolve

```ts
// Value registration
container.register(Config, { host: "localhost", port: 5432 });

// Factory registration (lazy, dependency injection via container parameter)
container.registerFactory(DB, (c) => new Database(c.resolve(Config)));

// Resolve
const config = container.resolve(Config);
const db = container.resolve(DB);
```

### Provider Scopes

| Scope | Behavior |
|-------|----------|
| `singleton` (default) | One instance per container. Factory called once, result cached. |
| `transient` | New instance on every `resolve()`. Factory called each time. |
| `request` | One instance per request scope. Factory called once per fork. |

```ts
container.register(Service, new Service(), { scope: "singleton" });
container.registerFactory(DB, () => new Database(), { scope: "transient" });
container.registerFactory(RequestCtx, () => new RequestContext(), { scope: "request" });
```

Singleton factories are called once on first resolve and the result is cached. Transient factories are called on every resolve. Request-scoped entries are inherited by child containers but re-evaluated.

### Request Scope

```ts
app.onRequest((ctx) => {
  const requestContainer = container.createRequestScope();
  ctx.store.container = requestContainer;
});
```

`createRequestScope()` forks the container, copying singleton and transient entries but skipping request-scoped ones so they are re-created per request.

### Test Overrides

```ts
import { createTestContainer } from "@ogerjs/core";

const mockDb = { findAll: () => [] };
const testContainer = createTestContainer({
  [DB]: mockDb,
});
```

`createTestContainer()` creates a fresh container and applies overrides. Overrides take priority over registered entries during resolve.

### Circular Dependency Detection

The container throws on circular factory resolution:

```ts
container.registerFactory(A, (c) => new A(c.resolve(B)));
container.registerFactory(B, (c) => new B(c.resolve(A)));
container.resolve(A); // Error: DI: circular dependency detected
```

## Module System

### defineModule

Modules encapsulate providers, routes, and nested modules into a single scoped Oger app:

```ts
import { defineModule, Oger } from "@ogerjs/core";

const DB = Symbol("db");

const usersModule = defineModule({
  name: "users",
  providers: [
    { token: DB, useFactory: () => new UserRepository() },
  ],
  setup: ({ app, container }) => {
    app.get("/users", async () => container.resolve(DB).findAll());
    app.post("/users", async ({ body }) => container.resolve(DB).create(body));
  },
});

const app = new Oger().use(usersModule);
```

### Module Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Module identifier (used as scoped app name) |
| `providers` | `Provider[]` | Array of `{ token, useValue }` or `{ token, useFactory }` |
| `imports` | `OgerModule[]` | Nested modules merged in dependency order (Phase 2) |
| `exports` | `Token[]` | Tokens exported to parent module scope (Phase 2) |
| `setup` | `(ctx: ModuleContext) => void` | Receives `{ app, container }` for route registration |

### ModuleContext

```ts
interface ModuleContext {
  app: Oger;
  container: Container;
}
```

The module's `setup` receives a scoped `Oger` instance and the module's own child container. Routes registered on `app` are merged into the parent via `.use()`.

### Nested Modules

```ts
const dataModule = defineModule({
  name: "data",
  providers: [{ token: DB, useFactory: () => new Db() }],
  imports: [usersModule, postsModule],
  exports: [DB],
});

app.use(dataModule);
```

### Provider Types

```ts
type Provider =
  | { token: Token; useValue: unknown }
  | { token: Token; useFactory: (container: Container) => unknown };
```

## Controllers

Optional controller pattern for class-based route organization:

```ts
import { defineController } from "@ogerjs/core";

class UsersController {
  constructor(private db: UserRepository) {}

  list() { return this.db.findAll(); }
  get({ params }: { params: { id: string } }) { return this.db.findById(params.id); }
  create({ body }: { body: { name: string } }) { return this.db.create(body); }
}

const usersController = defineController({
  prefix: "/users",
  routes: [
    { method: "get", path: "/", handler: (ctx) => ctx.store.controller.list() },
    { method: "get", path: "/:id", handler: (ctx) => ctx.store.controller.get(ctx) },
    { method: "post", path: "/", handler: (ctx) => ctx.store.controller.create(ctx) },
  ],
});

app.use(usersController);
```

| Property | Type | Description |
|----------|------|-------------|
| `prefix` | `string` | Route group prefix applied to all routes |
| `routes` | `ControllerRoute[]` | Array of `{ method, path, handler }` |

## Integration with App

```ts
import { createContainer, defineModule, Oger } from "@ogerjs/core";

const AppModule = defineModule({
  name: "app",
  providers: [
    { token: "config", useValue: loadConfig() },
    { token: DB, useFactory: (c) => new Database(c.resolve("config")) },
  ],
});

const app = new Oger();
const container = createContainer();

// Register app-level providers
for (const p of AppModule.providers ?? []) {
  if ("useValue" in p) container.register(p.token, p.useValue);
  else container.registerFactory(p.token, p.useFactory);
}

app.use(AppModule);
```

## Injection in Routes

Values injected into the DI container can be accessed via the request context:

```ts
container.register(DB, new Database());
app.decorate({ container });

app.get("/users", (ctx) => {
  const db = (ctx.store.container as Container).resolve(DB);
  return db.findAll();
});
```

## Best Practices

1. **Use Symbols** for tokens to avoid collisions across modules
2. **Keep modules small** — one domain per module
3. **Use request scope** for per-request state (DB transactions, user context)
4. **Test with overrides** — `createTestContainer` for unit tests
5. **Avoid circular deps** — container throws on detection

See also: [PLUGINS.md](./PLUGINS.md), [TESTING.md](./TESTING.md)
