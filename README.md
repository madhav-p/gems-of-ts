# gems-of-typescript

> Exploring the different ways **TypeScript can help build type-safe libraries
> with little to no types in userland code.**

The idea: push the type machinery *into the library*, so that users describe
**data and structure** (a grammar, a schema shape, a router) and get precise,
inferred types — branded values, discriminated unions, checked references — for
free, without writing a single generic or annotation themselves.

```ts
// userland: no type annotations, yet `tree` is a discriminated AST
const parse = createParser(JSONGrammar)
const tree = parse('{"a": [1, true]}')

// userland: no type annotations, yet `user` is a fully typed class instance
class User extends t.object({
  id: t.number(),
  email: t.string((s) => s.format('email')),
}) {}
```

## Principles

1. **Type safety with ~zero userland types.** The library infers everything from
   the data you give it — grammar tables, schema shapes, router maps — and
   constrains it (e.g. a node reference can only name a declared node).
2. **Serializable by design.** Schemas are first-class data that round-trip to
   **JSON Schema**. This is why `refine` / `superRefine` are deliberately out of
   scope — arbitrary predicates cannot be serialized.
3. **Zero runtime dependencies.** Small, self-contained packages.
4. **Performance is *not* the top priority right now** — correctness, ergonomics
   and inference are. We only care about performance when something is
   *catastrophic*, and we benchmark/profiling when we do.
5. **Class output + validated mutation** (schema) as a deliberate alternative to
   "parse returns a plain object": parsed values are instances of your class, and
   assigning an invalid property re-runs validation.

## Packages

| Package | What it is | Status |
| --- | --- | --- |
| [`@gems-of-ts/schema`](libs/schema) | Class-based schema with a callback/view DSL, JSON Schema output, format registry, branded strings, and `compile()`. | ✅ |
| [`@gems-of-ts/parser`](libs/parser) | Declarative grammar (tokens + nodes) that parses text into a discriminated AST **whose type is inferred from the grammar**. | ✅ |
| [`@gems-of-ts/router`](libs/router) | Schema-typed router with separate `server` / `client` entrypoints and an in-process caller. | ✅ (early) |

### `@gems-of-ts/schema`

```ts
const t = createSchemaBuilder({
  stringFormats: { ip: { validate: (v) => (isIPv4(v) ? undefined : 'Expected an IP') } },
})

class User extends t.object({
  id: t.number(),
  name: t.string((s) => s.length((n) => n.min(1))),
  email: t.string((s) => s.format('email', { domain: (d) => d.matches(/^example\.com$/) })),
  website: t.string((s) => s.format('url')).optional(),
}) {}

const user = User.parse(input)     // instance of User — `instanceof` holds
user.name = ''                     // throws SchemaParseError (validated mutation)
User.toJSONSchema()                // native JSON Schema
User.compile()(input)              // ~2.8× faster standalone validator
```

Highlights: immutable callback/view DSL · per-builder format registry (add /
override, with sub-string *parts* like `email.domain` and `url.host`) · branded
formatted strings (`string & { __format: 'email' }`) · optional · literals
(`'admin'`, `null`) · arrays with validated mutators · JSON Schema ·
`parse` / `safeParse` with structured issues · `compile()` for a standalone fast
validator.

### `@gems-of-ts/parser`

```ts
const json = createGrammar({ number: /\d+/, comma: /,/ /* … */ }, {
  number: (r) => r.token('number'),
  array: (r) => r.seq({ _lb: r.token('lb'), items: r.list(r.node('root'), r.token('comma')), _rb: r.token('rb') }),
  root: (r) => r.oneOf({ number: r.node('number'), array: r.node('array') }),
})

const parse = createParser(json)     // (input: string) => inferred AST
parse('[1,2]')                       // { type: 'array', value: { items: [...] }, raw: '[1,2]' }
```

Highlights: combinators (`token`/`node`/`seq`/`oneOf`/`optional`/`list`) ·
`_`-prefixed fields dropped from the AST · `{ type, value, raw }` discriminated
output you can `switch` on with narrowing · node/token references are name-checked
at compile time · optional `location` offsets and a `compile: true` fast parser ·
configurable insignificant whitespace.

### `@gems-of-ts/router`

```ts
const app = world<{ userId: string | null }>()

const appRoutes = router({
  getUser: app.query({
    input: object({ id: string((s) => s.length((n) => n.min(1))) }),
    auth: (ctx) => ctx.userId !== null,
    handler: ({ input, ctx }) => ({ id: input.id, requestedBy: ctx.userId }),
  }),
})

createCaller(appRoutes, { userId: 'u1' })       // typed in-process caller
createClient<typeof appRoutes>({ link })        // typed client, nesting mirrored
```

Highlights: `world<Context>()` route definitions (`query`/`mutation`/`subscription`)
· schema-validated input · `auth` predicate · separate `server` and `client`
entrypoints · a `Link` abstraction so the client can talk to HTTP, Convex, or an
in-process caller.

## Progress so far

- **Schema** — callback/view DSL over a class-based engine; formats with
  sub-string parts, per-builder registries and overrides; branded strings; native
  JSON Schema; `compile()` and `safeParse`; 46 tests.
- **Parser** — full grammar DSL with end-to-end AST type inference and name
  safety; JSON, XML, S-expression, semver, query-string and TOML grammars in the
  test suite; `location` and `compile` settings; 54 tests.
- **Router** — schema-typed caller + client, 5 tests.
- **Tooling** — pnpm workspace + catalog, **Turborepo** (build / lint / typecheck /
  test), build via `tsup` (JS) + `tsc` (`.d.ts`), and publishing to **npm and JSR**
  via `scripts/publish.mjs` + GitHub Actions (CI, and publish-on-change).
- **Performance** — tracked with benchmarks (`bench`) and profiled with Node's CPU
  profiler (`profile` + `scripts/analyze-profile.mjs`). Profiling already caught
  one *catastrophic* case: throwing `Error` for backtracking was ~90% of parse
  time; switching to a plain-object signal made the parser ~20× faster.

## Roadmap

**1. More feature parity with TypeBox / Zod** — *minus* `refine` / `superRefine`,
which cannot be serialized to a JSON object:

- unions, discriminated unions, intersections, tuples, records, literals, enums
- recursive / lazy schemas
- defaults, coercion, and (serializable) transforms
- richer error formatting and issue metadata
- more built-in formats, and a JSON-Schema-first builder surface

**2. State machines + durable workflows** — a new gem (à la XState + durable
execution): typed events/context, and workflows that can suspend/resume and
survive restarts, again inferring as much as possible from the definition.

**3. Parser parity with the alternatives** — close the gap with PEG / combinator
libraries:

- left recursion / operator associativity, captured delimiters
- better error reporting and recovery
- token decoding (typed literal values instead of raw text)
- transform/output mapping

**4. Website, docs & playground** — coming soon: documentation and an interactive
playground for building grammars/schemas in the browser.

## Repository layout

```
.
├── libs/
│   ├── schema/     @gems-of-ts/schema
│   ├── parser/     @gems-of-ts/parser
│   └── router/     @gems-of-ts/router
├── scripts/        analyze-profile.mjs, publish.mjs
├── turbo.json
└── .github/workflows/   ci.yml, publish.yml
```

## Development

```sh
pnpm install

pnpm run build        # turbo: tsup (js) + tsc (.d.ts)
pnpm run test         # turbo: vitest
pnpm run typecheck
pnpm run lint

# per-package
pnpm --filter @gems-of-ts/parser bench
pnpm --filter @gems-of-ts/schema bench
```

Packages publish to **npm** and **JSR** under the `@gems-of-ts` scope;
`pnpm run release` publishes any package whose `version` isn't yet on the registry.

## Status

Early and exploratory — APIs may change. The point is to learn **how far
TypeScript's type system can carry a library**, and how little userland code has
to say to get strong guarantees.
