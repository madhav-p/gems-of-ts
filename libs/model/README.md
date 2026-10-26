# @gems-of-ts/model

Object-syntax schemas designed so **invalid states are hard to represent**.
Instead of a callback/view DSL, you describe a schema with one options object;
the type system rejects contradictory combinations, and the runtime rejects the
states TypeScript cannot express.

Every validator is a **class** with static `parse` / `safeParse`. Object and list
classes can be extended, and parsing returns an instance of the subclass.
Parsed object/list values are **deeply readonly and frozen**; use `mutate` to
produce a new validated value.

```ts
import { createTypeBuilder } from '@gems-of-ts/model'

const model = createTypeBuilder()

class User extends model.object({
  name: model.string({ length: { min: 1, max: 50 } }),
  age: model.number({ min: 0 }).optional(),
  tags: model.list(model.string()),
  deletedAt: model.null(),
}) {}

const user = User.parse({ name: 'Ada', tags: ['admin'], deletedAt: null })

user instanceof User // true
```

All schemas are reached through the builder returned by `createTypeBuilder`.
`model.null()` and `model.enum()` exist because `null` and `enum` are reserved
words. Builtin schemas are not exported as standalone functions.

## Install

```sh
pnpm add @gems-of-ts/model
```

No runtime dependencies.

See [Feature parity vs Zod and TypeBox](docs/feature-parity.md) for a detailed
capability matrix, gaps, and migration notes.

## Number

```ts
model.number()                              // any finite number
model.number({ min: 0, max: 120 })          // inclusive range
model.number({ gt: 0, lt: 1 })              // exclusive range
model.number({ min: 0, lt: 10 })            // mixed
model.number({ gt: 0, max: 10 })            // mixed
model.number({ eq: 42 })                    // exact value
model.number({ int: true })                 // integer
model.number({ int: true, min: 1 })         // integer + bounds
model.number({ eq: 0, int: true })          // exact integer
model.number({ multipleOf: 5 })             // multiple of 5
model.number({ min: 0, multipleOf: 10 })    // bounds + multipleOf

model.int()                                 // integer type
model.int({ min: 0, max: 100 })             // integer + bounds
model.int({ eq: 42 })                       // exact integer
model.int({ multipleOf: 2 })                // even integer
```

`multipleOf` must be a positive finite number. A non-multiple `eq` is rejected
when the schema is built:

```ts
model.number({ multipleOf: 2 }).parse(4) // 4
model.number({ multipleOf: 2 }).parse(3) // throws ModelParseError
model.number({ multipleOf: 0 })          // throws ModelDefinitionError
model.number({ eq: 5, multipleOf: 2 })   // throws ModelDefinitionError
```

### Type-level guarantees

`eq` is mutually exclusive with **all** bounds:

```ts
model.number({ eq: 1, min: 0 }) // ❌ type error
model.number({ eq: 1, max: 2 }) // ❌ type error
model.number({ eq: 1, gt: 0 })  // ❌ type error
model.number({ eq: 1, lt: 2 })  // ❌ type error
```

Each bound has exactly one spelling. Supplying both spellings on the same side
is rejected:

```ts
model.number({ min: 0, gt: 1 })  // ❌ type error
model.number({ max: 10, lt: 5 }) // ❌ type error
```

An `eq` schema infers the literal value, so the parsed type is narrower:

```ts
const answer = model.number({ eq: 42 })
type Answer = ReturnType<typeof answer.parse> // 42
```

### Runtime definition errors

Some combinations cannot be expressed in TypeScript. These throw a
`ModelDefinitionError` **when the schema is created** (not per parse):

```ts
model.number({ min: 10, max: 0 }) // throws: lower bound must not exceed upper bound
model.number({ gt: 1, lt: 1 })    // throws: the range is empty
model.number({ min: 1, lt: 1 })   // throws: the range is empty
model.number({ gt: 1, max: 1 })   // throws: the range is empty
model.number({ min: Infinity })   // throws: "min" must be a finite number
model.number({ eq: 1.5, int: true }) // throws: "eq" must be an integer when "int" is true
```

The runtime also re-checks the type-level exclusions, so JavaScript callers (or
objects built dynamically) cannot bypass them.

## String

```ts
model.string()                                            // any string
model.string({ length: { min: 2, max: 20 } })             // length range
model.string({ length: { eq: 3 } })                       // exact length
model.string({ length: { gt: 0, lt: 10 } })               // exclusive length range
model.string({ pattern: /^[a-z]+$/ })                     // pattern
model.string({ length: { min: 1 }, pattern: /^[a-z]+$/ }) // combined
model.string({ startsWith: 'a', endsWith: 'z' })          // text matches
model.string({ includes: 'mid' })                         // substring
model.string({ eq: 'admin' })                             // exact value
```

`length` is a nested **number options object**, so it reuses every number
validator and every number type-level exclusion:

```ts
model.string({ length: { eq: 1, min: 0 } }) // ❌ type error
model.string({ length: { min: 0, gt: 1 } }) // ❌ type error
model.string({ length: { max: 10, lt: 5 } }) // ❌ type error
```

`eq` is mutually exclusive with every other constraint:

```ts
model.string({ eq: 'a', length: { min: 1 } }) // ❌ type error
model.string({ eq: 'a', pattern: /a/ })       // ❌ type error
model.string({ eq: 'a', startsWith: 'a' })    // ❌ type error
```

`pattern` is mutually exclusive with `startsWith` / `endsWith` / `includes`:

```ts
model.string({ pattern: /a/, startsWith: 'a' }) // ❌ type error
model.string({ pattern: /a/, includes: 'a' })   // ❌ type error
```

The text predicates are emitted as an equivalent JSON Schema `pattern`, so
`toJSONSchema()` still captures them.

Lengths must be non-negative integers, and the effective integer range must be
non-empty — both are checked at runtime:

```ts
model.string({ length: { min: 5, max: 1 } }) // throws ModelDefinitionError
model.string({ length: { min: -1 } })        // throws ModelDefinitionError
model.string({ length: { eq: 1.5 } })        // throws ModelDefinitionError
model.string({ length: { gt: 0, lt: 1 } })   // throws ModelDefinitionError (no integer length)
```

`eq` infers the literal type. Patterns are cloned without the stateful `g`/`y`
flags, so repeated `parse` calls are deterministic. JSON Schema has no regex
flags, so `toJSONSchema()` emits `pattern.source` only.

`model.string({ format: 'email' })` applies any built-in JSON Schema format. The
format constructors below are preferred.

### String formats

```ts
model.email({ length: { max: 50 } })
model.idnEmail()
model.URL()
model.uri()
model.iri()
model.uriReference()
model.iriReference()
model.hostname()
model.idnHostname()
model.ipv4()
model.ipv6()
model.uuid()
model.date()
model.time()
model.dateTime()
model.duration()
model.uriTemplate()
model.jsonPointer()
model.relativeJsonPointer()
model.regex()
```

Each format has its own validators type. It deliberately does **not** include
`format` (the constructor fixes it) and is not composed from `StringOptions`:

```ts
model.email({ length: { min: 1 }, pattern: /^[a-z@.]+$/ })
model.email({ eq: 'ada@example.com' })

model.email({ format: 'email' }) // ❌ type error
```

### Format property filters

Formats with stable parts accept filters for those parts. A part filter names the
part (`domain`, `year`, `octet1`, `hostname`, …) and is validated against that
part; all part filters compile into one JSON Schema `pattern`:

```ts
model.email({
  local: { matches: /^[a-z.]+$/ },
  domain: { endsWith: '.com' },
})

model.date({ year: { min: 2020 }, month: { eq: 2 }, day: { max: 29 } })
model.time({ hour: { min: 9, max: 17 }, offset: { eq: 'Z' } })
model.duration({ hours: { max: 24 } })
model.ipv4({ octet1: { eq: 192 }, octet2: { eq: 168 } })
model.hostname({ tld: { eq: 'com' }, labels: { min: 2 } })
model.uuid({ version: { eq: 4 }, variant: { min: 8, max: 11 } })

model.URL({
  protocol: { eq: 'https' },
  hostname: { eq: '127.0.0.1' },
  port: { min: 3000, max: 5000 },
  pathname: { startsWith: '/api' },
})

model.uri({
  scheme: { eq: 'https' },
  hostname: { eq: 'example.com' },
  query: { eq: 'x=1' },
})
```

| Format | Parts |
| --- | --- |
| `email`, `idnEmail` | `local`, `domain` |
| `URL` | `protocol`, `username`, `password`, `host`, `hostname`, `port`, `pathname`, `search`, `hash` |
| `uri`, `iri` | `scheme`, `username`, `password`, `host`, `hostname`, `port`, `path`, `query`, `fragment` |
| `uriReference`, `iriReference` | same parts as `uri`; the scheme is optional |
| `date` | `year`, `month`, `day` |
| `time` | `hour`, `minute`, `second`, `fraction`, `offset` |
| `dateTime` | date and time parts |
| `duration` | `years`, `months`, `weeks`, `days`, `hours`, `minutes`, `seconds` |
| `ipv4` | `octet1`–`octet4` |
| `hostname`, `idnHostname` | `tld`, `labels` |
| `uuid` | `version`, `variant` (hex nibbles, `0..15`) |

- The format's own validator still checks its base syntax (for example leap
  years, duration ordering, or IP octet rules); the emitted `pattern` encodes
  the part filters.
- String parts accept `eq`, `length`, `matches` (a full-part regex),
  `startsWith`, `endsWith`, and `includes`.
- Integer parts accept `eq`, `min`/`max`, and `gt`/`lt`. `multipleOf` is not
  supported because the filters compile to a regex.
- `matches` is applied to the extracted part at runtime. Because it is embedded
  in the emitted pattern, keep it scoped to the part; a pattern that can consume
  a delimiter may be more permissive in JSON Schema than at runtime.
- A part filter requires the part to be present. `duration({ hours: … })`
  therefore requires an hours component; `URL({ search: … })` requires `?…`.
- Whole-string `eq` cannot be combined with part filters. `host` includes the
  port, so it cannot be combined with `hostname` or `port`.
- `length` and `pattern` still apply to the whole string and can be combined
  with part filters.
- Ports are `0..65535` and must be explicit and written without leading zeros
  (`https://example.com` does not match `port: { eq: 443 }`). IPv4 octets are
  `0..255`; date and time fields are checked against their domains.
- URL parts match the text as written: `search` includes `?`, `hash` includes
  `#`, and `pathname` may be empty. URI `query` and `fragment` exclude their
  delimiters.
- `fraction` is the digits after `.`; `offset` is `Z`/`z` or `±HH:MM`.
  `duration.seconds` is a string part because it may contain a decimal; the
  other duration components are integers.
- `hostname.labels` is the total number of labels, including the TLD.
- `uuid` version/variant are integer nibbles: `8..11` means `8`, `9`, `a`, `b`.
- Hosts, domains, and schemes match case-insensitively; local parts, paths,
  queries, and fragments are case-sensitive.
- Date parts outside their domains, empty ranges, impossible exact dates,
  duplicate `eq`/bound combinations, unknown part names, and literals containing
  URL delimiters throw `ModelDefinitionError` when the schema is created.
- `ipv6`, `uriTemplate`, `jsonPointer`, `relativeJsonPointer`, and `regex` keep
  whole-string `eq`/`length`/`pattern` only: their parts are either ambiguous
  (IPv6 `::`) or not stable text positions.

Some combinations have no unambiguous meaning, so they are rejected at both the
type level and schema-creation time:

```ts
model.URL({ host: { eq: 'a' }, hostname: { eq: 'b' } }) // ❌ type error
model.URL({ host: { eq: 'a' }, port: { eq: 1 } })       // ❌ type error
model.email({ eq: 'ada@example.com', local: { eq: 'ada' } }) // ❌ type error
model.date({ month: { min: 13 } }) // throws ModelDefinitionError
```

## Boolean

```ts
model.boolean().parse(true)   // true
model.boolean().parse('true') // throws ModelParseError
```

Emits `{ type: 'boolean' }`.

## Null

`null` is a reserved word, so use `model.null()` or `model.nullType()`:

```ts
model.null().parse(null)     // null
model.nullType().parse(null) // null
```

Emits `{ type: 'null' }`.

## Literal

```ts
model.literal('admin') // 'admin'
model.literal(42)      // 42
model.literal(true)    // true
model.literal(null)    // null
```

Emits `{ const: value }`. Non-finite numbers throw `ModelDefinitionError`.

## Enum

```ts
model.enumType(['admin', 'user'])
model.enumType(['a', 1, true, null])
```

`enum` is reserved, so the direct export is `enumType`; the namespaced form is
`model.enum(...)`. Empty arrays, duplicate values, and non-finite numbers throw
`ModelDefinitionError`. Emits `{ enum: [...] }`.

## List

```ts
model.list(model.string({ length: { min: 1 } }))
model.list(model.number({ int: true }))
model.list(model.list(model.string()))

model.list(model.string(), { length: { min: 1, max: 3 } })
model.list(model.string(), { length: { eq: 2 } })
```

Elements must be required schemas — `model.list(model.string().optional())` is a type
error, because JSON arrays have no holes. Emits
`{ type: 'array', items, minItems?, maxItems? }`. Element errors carry the index
path. `length` is a nested number options object, reusing the number validator
rules and type-level exclusions.

List length is checked on parse **and** during `mutate`, including `push`,
`unshift`, `pop`, `shift`, `splice`, and `length` assignment:

```ts
const tags = model.list(model.string(), { length: { min: 1, max: 2 } })
const parsed = tags.parse(['a'])

mutate(parsed, (draft) => { draft.push('b') })    // ok
mutate(parsed, (draft) => { draft.push('b', 'c') }) // throws ModelParseError
mutate(parsed, (draft) => { draft.pop() })        // throws ModelParseError
```

Lists are classes too, so you can extend them:

```ts
class Tags extends model.list(model.string({ length: { min: 1 } })) {}

const tags = Tags.parse(['admin'])
tags instanceof Tags // true
```

## Tuple

```ts
const Point = model.tuple([model.number(), model.number()])
Point.parse([1, 2])
```

Fixed length, element-wise validation. Emits
`{ type: 'array', prefixItems, items: false, minItems, maxItems }`. Tuple items
must be required schemas. Parsed tuples are readonly/frozen and branded for
`mutate`.

## Record

```ts
const scores = model.record(model.number({ min: 0 }))
scores.parse({ ada: 10, grace: 20 })
```

Keys are always strings; every value is validated by the supplied schema.
Values must be required schemas (`model.record(model.string().optional())` is a type error).
Emits `{ type: 'object', additionalProperties: valueSchema }`. Parsed records are
readonly/frozen, branded, and work with `mutate`.

## Object

```ts
const User = model.object({
  name: model.string({ length: { min: 1 } }),
  age: model.number({ min: 0 }).optional(),
  tags: model.list(model.string()),
})
```

- `parse` returns an **instance of the class** (or subclass), so `instanceof`
  and `new User(value)` both work.
- `User.parse(value)` is typed as `User`; `User.safeParse(value)` is typed as
  `ParseResult<User>`.
- Unknown keys are stripped.
- Optional fields may be absent; they are omitted from the parsed output and
  from JSON Schema `required`.
- Nested errors carry a path, e.g. `['tags', 1]` or `['address', 'street']`.
- Emits `{ type: 'object', properties, required, additionalProperties: false }`.
- The optional second argument is reserved for object-level validations.

Subclasses keep the output type:

```ts
class Admin extends User {}

Admin.parse(value) instanceof Admin // true
Admin.parse(value) instanceof User  // true
```

### Object combinators

```ts
const PublicUser = User.pick(['name', 'age'])
const WithoutAge = User.omit(['age'])
const PartialUser = User.partial()
const RequiredUser = User.partial().required()
const Merged = A.merge(B) // B wins on duplicate keys
```

- `pick`/`omit` reject unknown keys at compile time and runtime.
- `partial` wraps every field with `.optional()`.
- `required` unwraps optional fields back to their required schema.
- `merge` combines shapes; the later schema wins on duplicate keys.
- Every combinator returns a new object schema class.

## Discriminated union

```ts
const Shape = model.union({
  circle: model.object({ radius: model.number() }),
  square: model.object({ side: model.number() }),
})

Shape.parse({ __type: 'circle', data: { radius: 2 } })
// { __type: 'circle', data: Circle }
```

- Variants are object schemas; each is wrapped as
  `{ __type: variantKey, data: variantValue }`.
- `__type` is the default discriminant key. If a variant already has a
  `__type` field, pass an explicit key as the second argument:
  ```ts
  model.union({ meta: model.object({ __type: model.literal('meta'), value: model.number() }) }, 'kind')
  ```
- The one-argument form is a type error when any variant contains `__type`.
- Parsed wrappers are class instances (`instanceof Shape`); `data` is the
  variant instance.
- Emits `{ oneOf: [...] }`. General (non-discriminated) unions are not
  supported.

## Intersection

```ts
const Person = model.intersection([
  model.object({ name: model.string() }),
  model.object({ age: model.number() }),
])

Person.parse({ name: 'Ada', age: 36 })
```

- All schemas must pass; object outputs are merged into one plain readonly
  object.
- Emits `{ allOf: [...] }`.
- Intersection results are **not branded**, so `mutate` does not accept them.
  Use `merge` on object schemas when you need a class-based merged shape.

## Custom types

`createTypeBuilder` can take a callback that receives the built-in builder and
returns additional constructors:

```ts
import { createTypeBuilder } from '@gems-of-ts/model'

const model = createTypeBuilder((tb) => ({
  slug: (validators?: { length?: NumberOptions }) =>
    tb.string({ ...validators, pattern: /^[a-z0-9-]+$/ }),
}))

model.slug({ length: { max: 40 } }).parse('my-post')
```

Custom types are scoped to the builder and can override built-ins. Built-in
schemas are never exported as standalone functions.

## Optional

`.optional()` is a method chain on every schema:

```ts
model.string({ length: { min: 1 } }).optional()
model.number().optional()
model.list(model.string()).optional()
model.object({ name: model.string() }).optional()
```

`parse(undefined)` returns `undefined`; every other value is validated by the
base schema. In an object shape, an optional field is omitted from both the
parsed output and JSON Schema `required`.

## Nullable

`.nullable()` accepts `null` in addition to the base value:

```ts
model.number({ min: 0 }).nullable().parse(null) // null
```

Emits `{ anyOf: [base, { type: 'null' }] }`.

## Default

`.default(value)` validates the default at definition time and fills
`undefined`:

```ts
const role = model.string({ length: { min: 1 } }).default('user')

role.parse(undefined) // 'user'
role.parse('admin')   // 'admin'

model.string({ length: { min: 1 } }).default('') // throws ModelDefinitionError
model.number().default('x')                      // ❌ compile error
```

- The default argument is typed as the schema output.
- Invalid defaults throw `ModelDefinitionError` when the schema is built.
- In object shapes, a defaulted field is filled when absent and omitted from
  JSON Schema `required`; the property includes `default: value`.
- `.optional()` after `.default()` wins for `undefined`.
- There is no coercion, `catch`, or `prefault`; defaults only fill `undefined`.

## Immutability

Object and list `parse` outputs are deeply readonly at the type level and frozen
at runtime:

```ts
const user = User.parse(input)

user.name = 'Grace'       // ❌ compile error (readonly)
user.tags.push('staff')   // ❌ compile error (readonly array)
user.address.street = 'x' // ❌ compile error (nested readonly)

Object.isFrozen(user)         // true
Object.isFrozen(user.tags)    // true
Object.isFrozen(user.address) // true
```

Parsing an existing frozen instance returns it unchanged:
`User.parse(user) === user`. This is the fast path for already-valid values.

## Mutation

`mutate` is an Immer-style reducer: it clones the current value into a deep
mutable draft, runs your recipe, then rebuilds the result — reusing unchanged
subtrees and validating only changed fields — and returns a new frozen instance.

```ts
import { mutate } from '@gems-of-ts/model'

const user = User.parse(rawInput)

const next = mutate(user, (draft) => {
  draft.name = 'Grace'
  draft.age = 37
  draft.tags.push('staff')
  draft.address.street = '2 Main St'
})

next instanceof User // true
user.name            // 'Ada' (original unchanged)
```

`mutate` accepts **only parsed model values**. Parse raw input first:

```ts
mutate(User.parse(rawInput), (draft) => { ... })
```

This is enforced two ways:

- Object parsed values extend the internal `Model` base class; list parsed
  values extend `ModelList`. Both share a nominal `ModelBrand`.
- `mutate` requires `T & ModelBrand`, and re-checks with `instanceof` at runtime.
  Raw objects fail both checks.

The schema class itself is inferred from the parsed value's constructor, so you
never pass it to `mutate`.

- Parsing an existing frozen instance returns early.
- The input is deep-frozen and already valid; the recipe works on a clone.
- Drafts preserve class prototypes, so subclass methods remain callable.
- If the recipe makes no changes, the original instance is returned.
- A returned value replaces the draft, e.g. `() => ({ ... })`.
- **Structural sharing:** unchanged subtrees are retained by reference from the
  source. If only `name` changes, `next.address === user.address` and
  `next.tags === user.tags`.
- **Only changed fields/elements are revalidated.** Changed leaves go through
  their field/element schema; unchanged values are trusted from the already-valid
  source.
- Temporary invalid intermediate states inside the recipe are allowed, as long
  as the changed parts of the final draft are valid.

## Parsing

Every schema class has static `parse`, `safeParse`, and `toJSONSchema`:

```ts
const score = model.number({ min: 0, max: 10 })

score.parse(7) // 7 — throws ModelParseError when invalid
score.safeParse(11) // { success: false, issues: [{ path: [], message: 'Expected a value of at most 10' }] }
score.toJSONSchema() // { type: 'number', minimum: 0, maximum: 10 }
```

`eq` schemas emit `{ const: value }`; `int: true` emits `type: 'integer'`.

## Concerns / where this approach fails

- **`mutate` accepts only parsed values.** Raw objects/arrays are rejected at
  compile time and runtime. Call `Schema.parse(raw)` first.
- **Primitive schemas cannot be mutated.** They have no mutable structure.
- **Change detection is still O(n).** `mutate` deep-clones the draft and uses
  deep equality to find changed subtrees. Validation is proportional to changed
  fields, but diffing still traverses the tree. Immer avoids this with proxies.
- **Final-state validation only.** `mutate` validates the changed parts of the
  finished draft, not every intermediate assignment. If every individual patch
  must be valid — for example, a two-step update that is only valid once both
  steps are applied — this approach fails. Use separate `mutate` calls instead.
- **Container-level validations would be skipped.** Object/list options are
  currently empty. If object-level or list-level rules are added later, `mutate`
  must run them explicitly, because it only validates changed field/element
  schemas.
- **Frozen values are not mutable by design.** Third-party code that expects to
  mutate parsed data will fail; use `mutate`, or adapt code that assumes mutable
  data.
- **Drafts lose some class behaviour.** Prototypes are preserved, but private
  fields (`#x`), symbol keys, non-enumerable properties, and own accessor
  properties are not cloned. Subclass methods that depend on private fields will
  not work on drafts.
- **List subclass methods are not in the draft type.** Runtime drafts preserve the
  list subclass prototype, but `Draft<T>` is a plain mutable array, so list
  subclass methods are not callable on the typed draft. Object drafts keep
  subclass methods.
- **Subclass field initializers cannot run.** Parsed instances are frozen before
  the subclass constructor body/field initializers finish, so `class User extends
  model.object(...) { extra = 1 }` throws (`Cannot define property ... object is not
  extensible`). Put data in the schema shape, or use getters/methods instead.
- **Early return trusts frozen instances.** Parsing returns any frozen instance
  of the target class without re-validating. Only construct values through
  `parse` / `new`; a hand-crafted `Object.create(User.prototype)` instance that
  is then frozen can bypass validation.
- **Cycles are unsupported.** `deepClone` and `deepEqual` assume acyclic
  JSON-like data, which is all the schemas can produce.
- **Readonly does not cover exotic objects.** `Object.freeze` is shallow for
  built-ins such as `Map`, `Set`, and `Date`; these are not supported by the
  schemas.
- **Complex readonly types.** For large shapes, `DeepReadonly<...>` can make
  editor types noisy and slow.
- **Unknown keys are stripped.** Object parsing does not reject extra keys; it
  silently removes them, matching the emitted `additionalProperties: false`.
  Unknown keys added in a `mutate` draft are likewise stripped, not rejected.
- **Record keys are always strings.** `record` has no key schema yet, so it
  cannot express `patternProperties` or key-level constraints.
- **`merge` resolves conflicts by overriding.** Duplicate keys keep the later
  schema; there is no conflict error.
- **`pick`/`omit` reject unknown keys.** Both the type system and runtime throw
  for keys that do not exist in the shape.
- **Unions are discriminated-only.** `union` requires object variants and a
  literal discriminant field; there is no general `A | B` union builder.
- **Intersection output is plain.** Object fields are merged into a readonly
  plain object; it is not a class-based model value, so `mutate` rejects it.
  Use `merge` for a class-based merged object schema.
- **Tuples use JSON Schema 2020-12.** They emit `prefixItems` + `items: false`
  rather than draft-07's array-form `items`.
- **Defaults only fill `undefined`.** There is no `catch`, `prefault`, coercion,
  or transform pipeline.
- **Tuple defaults do not fill missing positions.** Tuple length is fixed; a
  short input still fails.
- **Tuple mutation drafts lose positions.** `mutate` preserves tuple positions at
  runtime, but the draft type is a mutable array rather than a fixed-length
  tuple.

## Errors

```ts
class ModelDefinitionError extends Error {} // invalid schema definition
class ModelParseError extends Error {
  readonly issues: Array<{ path: Array<string | number>; message: string }>
}
```

`parse` throws `ModelParseError`; `safeParse` returns the issues. Definition
mistakes throw `ModelDefinitionError` immediately.

## API

```ts
import {
  createTypeBuilder,
  mutate,
  type AllOfJsonSchema,
  type AnyOfJsonSchema,
  type BooleanJsonSchema,
  type BooleanSchema,
  type Constructable,
  type DeepMutable,
  type DeepReadonly,
  type DateValidators,
  type DateTimeValidators,
  type DefaultSchema,
  type DiscriminatedUnionSchema,
  type Draft,
  type DurationValidators,
  type EmailValidators,
  type EnumJsonSchema,
  type EnumSchema,
  type HostnameValidators,
  type InferSchema,
  type InferShape,
  type IntegerPartValidators,
  type IntValidators,
  type IPv4Validators,
  type IntersectionElement,
  type IntersectionOutput,
  type IntersectionSchema,
  type ListElement,
  type ListJsonSchema,
  type ListOptions,
  type ListSchema,
  type LiteralJsonSchema,
  type LiteralSchema,
  type LiteralValue,
  type MergeShape,
  type ModelBrand,
  type NullableSchema,
  type NullJsonSchema,
  type NullSchema,
  type NumberJsonSchema,
  type NumberOptions,
  type NumberOutput,
  type NumberSchema,
  type ObjectJsonSchema,
  type ObjectOptions,
  type ObjectSchema,
  type ObjectShape,
  type OmitShape,
  type OneOfJsonSchema,
  type OptionalSchema,
  type OutputOf,
  type ParseResult,
  type PartialShape,
  type PartLengthOptions,
  type PickShape,
  type ReadonlyList,
  type ReadonlyRecord,
  type ReadonlyShape,
  type ReadonlyTuple,
  type RecordJsonSchema,
  type RecordSchema,
  type RecordValue,
  type RequiredSchemaClass,
  type RequiredShape,
  type SchemaClass,
  type StringFormat,
  type StringFormatValidators,
  type StringJsonSchema,
  type StringOptions,
  type StringOutput,
  type StringPartValidators,
  type StringSchema,
  type TimeValidators,
  type TupleElement,
  type TupleJsonSchema,
  type TupleSchema,
  type UnionVariant,
  type URIFactory,
  type URIValidators,
  type URLSchema,
  type URLValidators,
  type UUIDValidators,
} from '@gems-of-ts/model'

const model = createTypeBuilder()


type ModelBuilder = {
  string<const O extends StringOptions = {}>(
    options?: O,
  ): StringSchema<StringOutput<O>>
  number<const O extends NumberOptions = {}>(
    options?: O,
  ): NumberSchema<NumberOutput<O>>
  int(validators?: IntValidators): NumberSchema<number>
  boolean(): BooleanSchema
  null(): NullSchema
  nullType(): NullSchema
  literal<const T extends LiteralValue>(value: T): LiteralSchema<T>
  enum<const V extends readonly [LiteralValue, ...LiteralValue[]]>(
    values: V,
  ): EnumSchema<V[number]>
  enumType<const V extends readonly [LiteralValue, ...LiteralValue[]]>(
    values: V,
  ): EnumSchema<V[number]>
  list<const S extends ListElement>(
    element: S,
    options?: ListOptions,
  ): ListSchema<S>
  tuple<const S extends readonly TupleElement[]>(items: S): TupleSchema<S>
  record<const V extends RecordValue>(values: V): RecordSchema<V>
  object<const S extends ObjectShape>(
    fields: S,
    options?: ObjectOptions,
  ): ObjectSchema<S>
  union<const V extends Record<string, UnionVariant>>(
    variants: V,
  ): DiscriminatedUnionSchema<'__type', V>
  union<
    const V extends Record<string, UnionVariant>,
    const D extends string,
  >(variants: V, discriminant: D): DiscriminatedUnionSchema<D, V>
  intersection<
    const S extends readonly [IntersectionElement, ...IntersectionElement[]],
  >(items: S): IntersectionSchema<S>

  email(validators?: EmailValidators): StringSchema<string>
  idnEmail(validators?: EmailValidators): StringSchema<string>
  URL(validators?: URLValidators): URLSchema
  uri(validators?: URIValidators): StringSchema<string>
  iri(validators?: URIValidators): StringSchema<string>
  uriReference(validators?: URIValidators): StringSchema<string>
  iriReference(validators?: URIValidators): StringSchema<string>
  hostname(validators?: HostnameValidators): StringSchema<string>
  idnHostname(validators?: HostnameValidators): StringSchema<string>
  ipv4(validators?: IPv4Validators): StringSchema<string>
  ipv6(validators?: StringFormatValidators): StringSchema<string>
  uuid(validators?: UUIDValidators): StringSchema<string>
  date(validators?: DateValidators): StringSchema<string>
  time(validators?: TimeValidators): StringSchema<string>
  dateTime(validators?: DateTimeValidators): StringSchema<string>
  duration(validators?: DurationValidators): StringSchema<string>
  uriTemplate(validators?: StringFormatValidators): StringSchema<string>
  jsonPointer(validators?: StringFormatValidators): StringSchema<string>
  relativeJsonPointer(validators?: StringFormatValidators): StringSchema<string>
  regex(validators?: StringFormatValidators): StringSchema<string>
}

function createTypeBuilder<D extends Record<string, unknown> = {}>(
  define?: (model: ModelBuilder) => D,
): Omit<ModelBuilder, keyof D> & D

// `EmailValidators`, `DateValidators`, `TimeValidators`, `DateTimeValidators`,
// `DurationValidators`, `HostnameValidators`, `IPv4Validators`,
// `UUIDValidators`, `URIValidators`, `URLValidators`, `StringFormatValidators`,
// and `IntValidators` are separate from `StringOptions`/`NumberOptions`; format
// types do not accept `format`.

type UnionOutput<V, D extends string> = {
  [K in keyof V]: {
    readonly [P in D]: K
    readonly data: InferSchema<V[K]>
  }
}[keyof V] & ModelBrand

function mutate<T>(
  input: T & ModelBrand,
  recipe: (draft: Draft<T>) => void | Draft<T>,
): T & ModelBrand


type OptionalSchema<T, J> = SchemaClass<T | undefined, J> & {
  readonly isOptional: true
}

type StringTextMatch =
  | {
      pattern: RegExp
      startsWith?: never
      endsWith?: never
      includes?: never
    }
  | {
      pattern?: never
      startsWith?: string
      endsWith?: string
      includes?: string
    }

type StringOptions =
  | {
      eq: string
      length?: never
      pattern?: never
      startsWith?: never
      endsWith?: never
      includes?: never
      format?: StringFormat
    }
  | ({
      eq?: never
      length?: NumberOptions
      format?: StringFormat
    } & StringTextMatch)

type NumberOptions =
  | {
      eq: number
      int?: boolean
      multipleOf?: number
      min?: never
      max?: never
      gt?: never
      lt?: never
    }
  | {
      int?: boolean
      multipleOf?: number
      min?: number
      max?: number
      gt?: never
      lt?: never
    }
  | { int?: boolean; multipleOf?: number; min?: number; lt?: number; gt?: never; max?: never }
  | { int?: boolean; multipleOf?: number; gt?: number; max?: number; min?: never; lt?: never }
  | { int?: boolean; multipleOf?: number; gt?: number; lt?: number; min?: never; max?: never }

type OutputOf<S> = S extends abstract new (...args: never[]) => infer I
  ? DeepReadonly<I>
  : S extends { parse(value: unknown): infer T }
    ? T
    : never

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? ReadonlyArray<DeepReadonly<U>>
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

type DeepMutable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyArray<infer U>
    ? DeepMutable<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
      : T

type SchemaClass<T, J> = {
  parse(value: unknown): T
  safeParse(value: unknown): ParseResult<T>
  toJSONSchema(): J
  readonly isOptional: boolean
  readonly hasDefault?: boolean
  optional(): OptionalSchema<T, J>
  nullable(): NullableSchema<T, J>
  default(value: T): DefaultSchema<T, J>
}

type NullableSchema<T, J> = RequiredSchemaClass<T | null, AnyOfJsonSchema> & {
  readonly inner: RequiredSchemaClass<T, J>
}

type DefaultSchema<T, J> = RequiredSchemaClass<T, J> & {
  readonly hasDefault: true
  readonly defaultValue: T
  readonly inner: RequiredSchemaClass<T, J>
}

type NumberSchema<T extends number = number> = SchemaClass<T, NumberJsonSchema> & {
  readonly isOptional: false
  readonly options: Readonly<NumberOptions>
}

type StringSchema<T extends string = string> = SchemaClass<T, StringJsonSchema> & {
  readonly isOptional: false
  readonly options: Readonly<StringOptions>
}

type BooleanSchema = SchemaClass<boolean, BooleanJsonSchema> & { readonly isOptional: false }
type NullSchema = SchemaClass<null, NullJsonSchema> & { readonly isOptional: false }

type ObjectOptions = Record<string, never>
type ListOptions = { length?: NumberOptions }

type ReadonlyShape<S extends ObjectShape> = DeepReadonly<InferShape<S>> & ModelBrand

type ObjectSchema<S extends ObjectShape> = {
  new (value: unknown): ReadonlyShape<S>
  parse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): DeepReadonly<InstanceType<This>> & ModelBrand
    (value: unknown): ReadonlyShape<S>
  }
  safeParse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): ParseResult<DeepReadonly<InstanceType<This>> & ModelBrand>
    (value: unknown): ParseResult<ReadonlyShape<S>>
  }
  toJSONSchema(): ObjectJsonSchema
  readonly isOptional: false
  readonly options: Readonly<ObjectOptions>
  readonly fields: S
  optional(): OptionalSchema<ReadonlyShape<S>, ObjectJsonSchema>
  pick<const K extends keyof S>(keys: readonly K[]): ObjectSchema<PickShape<S, K>>
  omit<const K extends keyof S>(keys: readonly K[]): ObjectSchema<OmitShape<S, K>>
  partial(): ObjectSchema<PartialShape<S>>
  required(): ObjectSchema<RequiredShape<S>>
  merge<U extends ObjectShape>(other: ObjectSchema<U>): ObjectSchema<MergeShape<S, U>>
}

type ReadonlyList<S extends ListElement> = ReadonlyArray<
  DeepReadonly<InferSchema<S>>
> &
  ModelBrand

type ListSchema<S extends ListElement> = {
  new (value: unknown): ReadonlyList<S>
  parse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): DeepReadonly<InstanceType<This>> & ModelBrand
    (value: unknown): ReadonlyList<S>
  }
  safeParse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): ParseResult<DeepReadonly<InstanceType<This>> & ModelBrand>
    (value: unknown): ParseResult<ReadonlyList<S>>
  }
  toJSONSchema(): ListJsonSchema
  readonly isOptional: false
  readonly options: Readonly<ListOptions>
  readonly element: S
  optional(): OptionalSchema<ReadonlyList<S>, ListJsonSchema>
}
```
