# @gems-of-ts/schema

A tiny, dependency-free schema library where **the parsed value is an instance of
your class** — so you get `instanceof`, real methods, and *validated mutation*
(assigning an invalid value re-runs the schema). Everything is described with an
**immutable callback/view DSL**, with **native JSON Schema** output and a
**per-builder format registry**.

```ts
import { createSchemaBuilder } from '@gems-of-ts/schema'

const t = createSchemaBuilder()

class User extends t.object({
  id: t.number(),
  name: t.string((s) => s.length((n) => n.min(1)).matches(/^[a-zA-Z]+$/)),
  email: t.string((s) => s.format('email')),
  website: t.string((s) => s.length((n) => n.max(100)).format('url')).optional(),
}) {}

const user = User.parse({ id: 1, name: 'Ada', email: 'ada@example.com' })

user instanceof User        // true
user.name = ''              // throws SchemaParseError
User.toJSONSchema()         // { type: 'object', properties: { ... }, ... }
```

---

## Table of contents

- [Install](#install)
- [Creating a builder](#creating-a-builder)
- [Concepts](#concepts)
  - [Views (immutable, result-based)](#views-immutable-result-based)
  - [object — class output](#object--class-output)
  - [string](#string)
  - [number](#number)
  - [boolean](#boolean)
  - [literal](#literal)
  - [array](#array)
  - [optional](#optional)
  - [Formats](#formats)
  - [Branded strings](#branded-strings)
  - [JSON Schema](#json-schema)
  - [Errors](#errors)
  - [Compiling](#compiling)
- [Examples](#examples)
- [API reference](#api-reference)
- [Comparison](#comparison)
- [Limitations and roadmap](#limitations-and-roadmap)

---

## Install

```sh
pnpm add @gems-of-ts/schema
```

No runtime dependencies. Requires a modern TypeScript (strict) and an ESM runtime.

---

## Creating a builder

There is **no global schema namespace**. You create one, optionally seeding extra
formats:

```ts
import { createSchemaBuilder } from '@gems-of-ts/schema'

const t = createSchemaBuilder({
  stringFormats: {
    ip: { validate: (v) => (isIPv4(v) ? undefined : 'Expected an IP'), jsonFormat: 'ipv4' },
  },
  // numberFormats: { ... },
})

t.object, t.string, t.number, t.boolean, t.literal, t.array
```

Built-in formats (`email`, `url`, `int`) are always available; anything you pass
in `stringFormats`/`numberFormats` **adds or overrides** them. Registries are
**fixed at creation** and **scoped to the builder**, so formats never leak between
builders and there is no global mutable state.

---

## Concepts

### Views (immutable, result-based)

`string(...)`, `number(...)` (and the object/array constructors) take a callback
that receives a **view** — an immutable builder. Every method returns a *new*
view, and the callback's **return value** defines the schema. So always `return`
the chain:

```ts
// ✅
t.number((n) => n.format('int').min(0))
// ❌ constraints are recorded only via the returned view
t.number((n) => { n.min(0) })
```

### object — class output

`t.object(shape)` returns a **class**. Extend it (or use it directly):

```ts
class Address extends t.object({ street: t.string((s) => s.length((n) => n.min(1))) }) {}

class User extends t.object({
  name: t.string((s) => s.length((n) => n.min(1))),
  address: Address,
  tags: t.array(t.string((s) => s.length((n) => n.min(1)))),
}) {}
```

- `User.parse(value)` → an **instance of `User`** (`instanceof` holds, nested
  objects are instances of their classes too).
- `User.safeParse(value)` → `{ success: true, data } | { success: false, issues }`.
- `User.toJSONSchema()` → JSON Schema object.
- `new User(value)` → runs the same validation as `parse` (a subclass constructor
  cannot skip it).
- **Mutation validation:** parsed objects are Proxies. Every mutating operation is
  re-checked against the field's schema — assignment (`set`),
  `Object.defineProperty`, and `delete`. Invalid assignments throw, unknown keys
  are stripped, and deleting a **required** property throws (optional ones may be
  deleted). Nested objects and arrays are wrapped too, so `user.address.city = ''`
  is validated as well.
- **Re-parsing is free.** Passing a value that is already an instance of the class
  returns it as-is — no re-validation, no rebuild. `User.parse(user) === user`, and
  since nested values are instances too, re-assigning a *filtered* array of
  already-parsed items only re-wraps the array; the items are reused, not
  re-parsed. (Plain/new values are still fully validated.) Measured ~**18×** faster
  than a fresh parse.

```ts
const user = User.parse({ name: 'Ada', address: { street: '1 Main St' }, tags: [] })
user.name = 'Grace'   // ok
user.name = ''        // throws SchemaParseError

User.parse(user) === user                 // true — no re-parse
user.items = user.items.filter((i) => i.active) // items reused, not re-parsed
```

### string

```ts
t.string()
t.string((s) => s.length(3))                       // exact length
t.string((s) => s.length((n) => n.min(2).max(4)))  // length range
t.string((s) => s.matches(/^[a-z]+$/))             // pattern
t.string((s) => s.format('email'))                 // named format
t.string((s) => s.length((n) => n.max(100)).format('url'))
```

### number

```ts
t.number()
t.number((n) => n.min(0).max(10))     // inclusive -> minimum / maximum
t.number((n) => n.gt(0).lt(1))        // exclusive -> exclusiveMinimum / exclusiveMaximum
t.number((n) => n.int())              // -> type: 'integer'
t.number((n) => n.format('int').min(0))
```

### boolean

```ts
t.boolean()
```

### literal

```ts
t.literal('admin')   // parses only 'admin' — type `'admin'`
t.literal(42)        // type `42`
t.literal(true)      // type `true`
t.literal(null)      // type `null`

t.literal('admin').optional()
```

A `literal` accepts exactly one value (string / number / boolean / `null`). The
parsed type is the literal type itself, and it emits JSON Schema `const`:
`{ const: 'admin' }`. It composes with objects/arrays and is enforced on mutation.

### array

```ts
t.array(t.string((s) => s.length((n) => n.min(1))))
```

Arrays are subclasses of `Array`. Every mutating operation is covered:

- incoming values are validated for index assignment (`set`),
  `Object.defineProperty`, `push`, `unshift`, `splice`, and `fill`;
- `delete` of an index throws (it would leave `undefined`);
- the length bounds (`min`/`max`) are enforced on `push`, `unshift`, `splice`,
  `pop`, `shift`, and `length` assignment — so an array can't be mutated out of
  its declared bounds.

### optional

```ts
t.string((s) => s.format('email')).optional()
t.number().optional()
```

An optional schema parses `undefined` to `undefined` (the field is omitted in
objects) and is typed `T | undefined`.

### Formats

A format is a named validation rule. **String formats** can also expose named
**parts** — sub-strings that are themselves refined by a nested string view.

Built-ins:

| Format | Kind | Emits | Parts |
| --- | --- | --- | --- |
| `email` | string | `format: 'email'` | `domain` |
| `url` | string | `format: 'uri'` | `host` |
| `int` | number | `type: 'integer'` | — |

```ts
// whole-value validation
t.string((s) => s.format('email'))

// refine a part
t.string((s) => s.format('email', { domain: (d) => d.matches(/^example\.com$/) }))
t.string((s) => s.format('url', { host: (h) => h.matches(/^(www\.)?linkedin\.com$/) }))
```

Register (or override) your own:

```ts
const t = createSchemaBuilder({
  stringFormats: {
    ip: {
      validate: (v) => (isIPv4(v) ? undefined : 'Expected a valid IPv4 address'),
      jsonFormat: 'ipv4',
      // parts: { ... }  — optional named sub-strings
    },
  },
})

t.string((s) => s.format('ip'))
```

- Unknown formats/options throw at **definition time**.
- Overriding a built-in affects only that builder.
- Number formats use the same pattern (`numberFormats: { even: { validate } }`).

### Branded strings

`format(...)` contributes a **brand** to the inferred type, so validated strings
are distinguishable:

```ts
const email = t.string((s) => s.format('email'))
type Email = ReturnType<typeof email.parse> // string & { readonly __format: 'email' }
```

### JSON Schema

`toJSONSchema()` is available on every schema and on object classes:

- string → `{ type, minLength?, maxLength?, pattern?, format? }`
- number → `{ type: 'number' | 'integer', minimum?, maximum?, exclusiveMinimum?, exclusiveMaximum? }`
- boolean → `{ type: 'boolean' }`
- array → `{ type: 'array', items, minItems?, maxItems? }`
- object → `{ type: 'object', properties, required, additionalProperties: false }`

### Errors

```ts
class SchemaParseError extends Error {
  readonly issues: Array<{ path: Array<string | number>; message: string }>
}
```

`parse` throws; `safeParse` returns issues (with nested `path`s). `message` is a
`; `-joined summary (`address.street: Expected at least 1 characters`).

### Compiling

Every schema has `compile()`, which returns a **standalone validation function** —
the same rules and the same `SchemaParseError`s, but without the class/`parse`
indirection and without the mutation-tracking proxies (like TypeBox's
`TypeCompiler`/`Value.Compile`):

```ts
const validate = User.compile()   // (value: unknown) => User
validate(input)                   // throws SchemaParseError, exactly like parse
```

Measured on a small nested object with `pnpm --filter @gems-of-ts/schema bench`
(Node 24, arm64, 100k iterations):

| variant | ops/sec | ms/op | vs `parse` |
| --- | ---: | ---: | ---: |
| `parse` | 1,430,832 | 0.0007 | 1.00× |
| `safeParse` | 1,468,021 | 0.0007 | 1.03× |
| **`compile()`** | **4,048,153** | **0.0002** | **2.83×** |

The speedup comes from skipping the `Proxy` + `setPrototypeOf` work that powers
mutation validation and building plain objects/arrays directly.

Trade-off: the compiled output is a **plain value** — not an instance of your
class, and **without mutation validation**. Use `parse` when you want class
identity + validated mutation; use `compile()` on hot paths (or in request
handlers) where you only need fast, throw-on-invalid validation.

---

## Examples

**Userland builder with a custom `ip` format**

```ts
const isIPv4 = (v: string) =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split('.').every((p) => Number(p) <= 255)

const t = createSchemaBuilder({
  stringFormats: {
    ip: { validate: (v) => (isIPv4(v) ? undefined : 'Expected a valid IPv4 address'), jsonFormat: 'ipv4' },
  },
})

class Device extends t.object({
  name: t.string((s) => s.length((n) => n.min(1))),
  address: t.string((s) => s.format('ip')),
}) {}

Device.parse({ name: 'router', address: '192.168.0.1' }) // ok
Device.parse({ name: 'router', address: '999.1.1.1' })   // throws
```

See `test/userland.test.ts` for a full "kitchen sink" example.

---

## API reference

### `createSchemaBuilder(config?)`

```ts
createSchemaBuilder({
  stringFormats?: Record<string, StringFormatSpec>
  numberFormats?: Record<string, NumberFormatSpec>
}): SchemaBuilder

type SchemaBuilder = {
  object: (shape) => ObjectSchema<Output>
  string: StringFactory
  number: NumberFactory
  boolean: () => BooleanSchema
  array: <T>(element: SchemaClass<T>) => ArraySchema<T>
}
```

### `StringFormatSpec`

```ts
type StringFormatSpec = {
  validate(value: string): string | undefined          // message, or undefined if valid
  parts?: Record<string, (value: string) => string | undefined>  // named sub-strings
  jsonFormat?: string                                  // emitted as `format`
}
```

### `NumberFormatSpec`

```ts
type NumberFormatSpec = {
  int?: boolean
  validate?(value: number): string | undefined
}
```

### Views

| View | Methods |
| --- | --- |
| `StringView` | `length(size \| (n) => n.…)`, `matches(re)`, `format(name, options?)` |
| `NumberView` | `min`, `max`, `gt`, `lt`, `int`, `format('int')` |

### Exported types

`SchemaBuilder`, `SchemaBuilderConfig`, `StringView`, `StringSchema`, `StringFactory`,
`NumberView`, `NumberSchema`, `NumberFactory`, `ObjectSchema`, `ArraySchema`,
`BooleanSchema`, `LiteralSchema`, `LiteralValue`, `StringFormatSpec`,
`NumberFormatSpec`, `FormatRegistry`,
`FormatConfig`, `SchemaParseError`, `SchemaIssue`, `ParseResult`, `SchemaClass`,
`OptionalSchema`, `Branded`, `JsonSchema`.

---

## Comparison

### Feature matrix

| | DSL | Parsed output | Type inference | JSON Schema | Validated mutation | Compile to fast fn | Formats | Runtime deps |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **@gems-of-ts/schema** | class + callback/view | **class instance** | ✅ inferred | ✅ native | ✅ (Proxy) | ✅ `compile()` (~2.8×) | per-builder registry (add/override, parts) | none |
| **Zod** | chainable methods | plain object | ✅ inferred | ⚠️ external (`zod-to-json-schema`) | ❌ | ❌ (third-party) | `.email()`/`.url()` + `.refine` | large-ish |
| **TypeBox** | JSON-Schema-first values | plain value | ✅ inferred | ✅ native (schema *is* JSON Schema) | ❌ | ✅ `TypeCompiler` | `format` keyword + registries | small |
| **Valibot** | pipe/modular functions | plain object | ✅ inferred | ⚠️ external | ❌ | ❌ | `v.email()` etc. | tiny (tree-shakeable) |

### How it's different

- **Class output.** Zod/Valibot/TypeBox return plain objects. Here `parse` returns
  an instance of your class, so you get `instanceof`, methods, and — uniquely —
  **validated mutation**: assigning an invalid value to a parsed object re-runs
  the field's schema and throws.
- **Native JSON Schema.** Like TypeBox (and unlike Zod/Valibot) JSON Schema is a
  first-class output, not an external converter. Unlike TypeBox, the *source of
  truth* is a class + view DSL rather than raw JSON Schema.
- **Compile to a fast function.** `schema.compile()` returns a standalone
  validator (~2.8× faster than `parse`) that replays the same rules and throws the
  same errors — like TypeBox's `TypeCompiler`.
- **Formats with parts + scoping.** Built-ins include sub-string refinements
  (`email.domain`, `url.host`), and the registry is created per builder so you can
  add or override formats without global state.
- **No global namespace.** You create a builder with `createSchemaBuilder(...)`,
  which makes custom formats and overrides explicit and testable.

### How it's similar

- Static type inference from the schema, discriminated via literal fields.
- Immutable schema construction (views are immutable, like Zod's chains).
- `parse` / `safeParse` split with structured issues (like Zod/Valibot).

### Where the others are ahead

- **Transforms / coercion / async** — Zod, Valibot and TypeBox support
  `.transform`, coercion (`z.coerce`), async refinements, and pipes. This library
  is **validation-only** (no transforms).
- **Bundle strategy** — Valibot is designed for minimal bundles via
  tree-shakeable composable validators; this library is small but not modular to
  that degree.
- **Ecosystem** — Zod/Valibot/TypeBox have large ecosystems, adapters, and
  per-value error formatting.
- **Unions / discriminated unions / recursion** — richer composition (this library
  currently has objects, arrays, optionals and primitives only).

---

## Limitations and roadmap

- **Validation only.** No transforms, coercion, defaults, or async refinements.
- **No unions / discriminated unions / intersections** yet.
- **No recursive (self-referencing) schemas** — shapes are eager.
- **`object` emits a JSON Schema type** but does not read one back in.
- **Brands are per format name** — two formats on one string accumulate as a union
  brand, and there is no separate `.brand<'X'>()` API.
- **Formats are validation-only**; `jsonFormat` is a passthrough string.
- **`compile()` output is plain** — no class instance, no mutation validation.

---

## Development

```sh
pnpm --filter @gems-of-ts/schema test        # run the test suites
pnpm --filter @gems-of-ts/schema typecheck   # tsc, includes type-level assertions
pnpm --filter @gems-of-ts/schema lint
pnpm --filter @gems-of-ts/schema bench       # parse vs compile benchmark
```
