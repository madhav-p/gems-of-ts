# Feature parity: `@gems-of-ts/model` vs Zod and TypeBox

> **Status:** early/experimental (`0.0.0`). This is a high-level parity snapshot
> against **Zod 4.x** and **TypeBox 1.x** as of **October 2026**, not a
> line-by-line audit. Both projects evolve quickly; treat the matrix as a design
> map, not a contract.

`model` is deliberately smaller than Zod and TypeBox. It optimizes for a
different set of guarantees:

- object-syntax schema definitions;
- parsed object/list/record values as **class instances** with subclass
  inference and methods;
- deeply **readonly, frozen** validation output;
- an Immer-style `mutate` with **structural sharing** and changed-only
  revalidation;
- invalid states pushed out at the type level, with runtime errors only for
  what TypeScript cannot express.

It is **not a drop-in replacement** for either library. The core JSON validation
subset is close; composition, transformation, ecosystem, and JSON-Schema breadth
are not.

## Legend

| Symbol | Meaning |
| --- | --- |
| ✅ | Supported in the core API |
| ⚠️ | Partial, caveated, or requires a workaround |
| ❌ | Not supported |

## Summary

| Area | `model` | Zod 4 | TypeBox 1.x |
| --- | --- | --- | --- |
| Core JSON primitives | ✅ | ✅ | ✅ |
| Objects, lists, tuples, records | ✅ | ✅ | ✅ |
| Object combinators | ✅ | ✅ | ✅ |
| Custom top-level types | ✅ builder callback | ✅ | ⚠️ |
| Literals and enums | ✅ | ✅ | ✅ |
| Optional fields | ✅ | ✅ | ✅ |
| Readonly/frozen output | ✅ | ❌ | ❌ |
| Class output / `instanceof` | ✅ | ❌ | ❌ |
| Structural-sharing mutation | ✅ | ❌ | ❌ |
| Tuples | ✅ | ✅ | ✅ |
| Intersections | ✅ | ✅ | ✅ |
| General unions | ❌ | ✅ | ✅ |
| Discriminated unions | ✅ | ✅ | ⚠️ |
| Recursive / lazy schemas | ❌ | ✅ | ✅ |
| Nullable | ✅ | ✅ | ✅ |
| Defaults | ✅ | ✅ | ✅ |
| Transforms / coercion | ❌ | ✅ | ✅ |
| Custom refinements | ❌ | ✅ | ⚠️ |
| String formats (`email`, `uuid`, …) | ✅ built-in format types | ✅ | ⚠️ |
| JSON Schema output | ✅ subset | ✅ | ✅ native |
| JSON Schema input | ❌ | ❌ | ✅ |
| Compiled validator | ❌ | ❌ | ✅ |
| Async validation | ❌ | ✅ | ❌ |
| Metadata / registries | ❌ | ✅ | ✅ |
| Ecosystem / adapters | ❌ (early) | ✅ | ✅ |
| Bundle size / tree-shaking | ✅ small | ✅ (`zod/mini`) | ✅ modular |
| Runtime dependencies | none | none | none |

## Detailed matrix

### Authoring

| Capability | `model` | Zod 4 | TypeBox 1.x |
| --- | --- | --- | --- |
| Definition style | object syntax + classes | fluent function API | JSON-Schema-like builders |
| Standalone schema value | ✅ class | ✅ `z.*` schema | ✅ `Type.*` schema |
| Composable/chainable methods | ⚠️ `.optional()` + object statics | ✅ | ✅ |
| Custom top-level schema types | ✅ via `createTypeBuilder` callback, composed from builtins | ✅ `z.custom` / `.refine` | ⚠️ `Type.Unsafe` / JSON Schema |
| Global namespace | ✅ builder from `createTypeBuilder()` | ✅ `z` | ✅ `Type` |
| Static schema methods (`parse`, `safeParse`) | ✅ | ✅ | ⚠️ separate `Value.*` / `TypeCompiler` |

### Primitive types

| Capability | `model` | Zod 4 | TypeBox 1.x |
| --- | --- | --- | --- |
| `number` | ✅ | ✅ | ✅ |
| `string` | ✅ | ✅ | ✅ |
| `boolean` | ✅ | ✅ | ✅ |
| `null` | ✅ | ✅ | ✅ |
| `literal` | ✅ | ✅ | ✅ |
| `enum` | ✅ (`enumType` / `model.enum`) | ✅ | ✅ |
| `date` | ❌ | ✅ | ✅ |
| `bigint` | ❌ | ✅ | ✅ |
| `map` / `set` | ❌ | ✅ | ⚠️ |
| `function` / `promise` | ❌ | ✅ | ⚠️ |
| `undefined` / `nan` / `symbol` | ❌ | ✅ | ⚠️ |
| Custom primitive | ⚠️ composition-only | ✅ | ⚠️ |

### Constraints

| Capability | `model` | Zod 4 | TypeBox 1.x |
| --- | --- | --- | --- |
| Number `min` / `max` / `gt` / `lt` | ✅ | ✅ | ✅ |
| Number `int` | ✅ | ✅ | ✅ |
| Number `multipleOf` | ✅ | ✅ | ✅ |
| Number finite/safe/positive helpers | ⚠️ finite by default; `min`/`max` express the rest | ✅ | ⚠️ JSON Schema keywords |
| String `length` (nested min/max/gt/lt/eq) | ✅ | ✅ | ⚠️ `minLength` / `maxLength` |
| String `pattern` | ✅ | ✅ | ✅ |
| String `startsWith` / `endsWith` / `includes` | ✅ (pattern-exclusive) | ✅ | ❌ |
| String formats (`email`, `url`, `uuid`, `date-time`, `ipv4`, …) | ✅ built-in format types | ✅ | ⚠️ format registry |
| String transforms (`trim`, `toLowerCase`, …) | ❌ | ✅ | ❌ |
| Literal/`eq` constraints | ✅ | ✅ | ✅ |
| Enum membership | ✅ | ✅ | ✅ |

### Objects and collections

| Capability | `model` | Zod 4 | TypeBox 1.x |
| --- | --- | --- | --- |
| Object shape | ✅ | ✅ | ✅ |
| Unknown keys | ⚠️ always stripped | ✅ strip/strict/passthrough | ⚠️ JSON Schema `additionalProperties` |
| Optional fields | ✅ | ✅ | ✅ |
| `pick` / `omit` | ✅ | ✅ | ✅ (`Type.Pick` / `Type.Omit`) |
| `partial` / `required` | ✅ | ✅ | ✅ (`Type.Partial` / `Type.Required`) |
| `merge` | ✅ (later wins) | ⚠️ deprecated in v4; use `extend` | ⚠️ via `Intersect` / spread |
| `extend` | ❌ (use `merge`) | ✅ | ⚠️ via composition |
| `strict` / `passthrough` / `catchall` | ❌ | ✅ | ⚠️ JSON Schema options |
| `deepPartial` | ❌ | ❌ (removed) | ⚠️ compose manually |
| Object-level validations | ❌ (options reserved) | ✅ via refinements | ⚠️ JSON Schema |
| Arrays/lists | ✅ | ✅ | ✅ |
| List `min` / `max` / `length` | ✅ nested `length` options | ✅ | ✅ |
| Tuple | ✅ fixed length | ✅ | ✅ |
| Record with string keys | ✅ | ✅ | ✅ |
| Record with key schema / pattern | ❌ | ✅ | ✅ |
| Partial record | ❌ | ✅ | ⚠️ |
| Maps / sets | ❌ | ✅ | ⚠️ |

### Composition

| Capability | `model` | Zod 4 | TypeBox 1.x |
| --- | --- | --- | --- |
| General unions | ❌ | ✅ | ✅ |
| Discriminated unions | ✅ tagged `{ __type, data }` wrapper; key defaults to `__type` | ✅ | ⚠️ expressible, no dedicated helper |
| Intersection | ✅ merged plain object | ✅ | ✅ |
| Tuple | ✅ fixed length | ✅ | ✅ |
| Recursive / lazy | ❌ | ✅ | ✅ |
| `oneOf` / `anyOf` / `allOf` | ✅ emitted for union/intersection/nullable | ⚠️ via unions/intersections | ✅ |
| Conditional schemas | ❌ | ⚠️ via refinements | ⚠️ JSON Schema |
| `not` | ❌ | ⚠️ via refinements | ⚠️ JSON Schema |
| Nullable | ✅ | ✅ | ✅ |
| Optional | ✅ | ✅ | ✅ |
| Default | ✅ (definition-validated; fills `undefined`) | ✅ | ✅ |
| Catch/fallback | ❌ | ✅ | ⚠️ `Value.Default` |
| Coercion | ❌ | ✅ | ✅ `Value.Convert` |
| Transform / pipe | ❌ | ✅ | ✅ recent TypeBox |
| Refine / superRefine | ❌ | ✅ | ⚠️ formats/custom JSON Schema |
| Async refinement/validation | ❌ | ✅ | ❌ |

### Validation and errors

| Capability | `model` | Zod 4 | TypeBox 1.x |
| --- | --- | --- | --- |
| `parse` (throwing) | ✅ | ✅ | ✅ `Value.Parse` |
| `safeParse` | ✅ | ✅ | ⚠️ `Value.Check` + `Value.Errors` |
| Async parse | ❌ | ✅ | ❌ |
| Structured issue list | ✅ `{ path, message }` | ✅ rich issue codes/unions | ✅ `ErrorIterator` |
| Custom error messages | ❌ | ✅ | ⚠️ |
| Error maps/formatting helpers | ❌ | ✅ | ⚠️ |
| Compiled validator | ❌ | ❌ | ✅ `TypeCompiler` |
| Corrective parse (default/convert/clean) | ❌ | ⚠️ default/coerce/transform | ✅ `Value.Parse` pipeline |
| Metadata / descriptions / registry | ❌ | ✅ v4 `.meta()` + registry | ✅ JSON Schema annotations / `$id` |

### Type inference and output

| Capability | `model` | Zod 4 | TypeBox 1.x |
| --- | --- | --- | --- |
| Static inference | ✅ (`ReturnType<typeof Schema.parse>`) | ✅ `z.infer` | ✅ `Static<typeof T>` |
| Literal inference | ✅ | ✅ | ✅ |
| Optional key inference | ✅ | ✅ | ✅ |
| Parse output | class instance | plain object/value | plain object/value |
| Subclass methods on output | ✅ | ❌ | ❌ |
| `instanceof` schema class | ✅ | ❌ | ❌ |
| Deep readonly output type | ✅ | ❌ | ❌ |
| Runtime frozen output | ✅ | ❌ | ❌ |
| Validated mutation helper | ✅ `mutate` | ❌ | ❌ |
| Structural sharing on update | ✅ | ❌ | ❌ |
| Changed-only revalidation | ✅ | ❌ | ❌ |

### JSON Schema

| Capability | `model` | Zod 4 | TypeBox 1.x |
| --- | --- | --- | --- |
| Output JSON Schema | ✅ subset | ✅ `z.toJSONSchema` | ✅ native |
| Input JSON Schema | ❌ | ❌ (not core) | ✅ |
| `$ref` / definitions | ❌ | ✅ | ✅ |
| `oneOf` / `anyOf` / `allOf` | ❌ | ✅ | ✅ |
| `patternProperties` | ❌ | ✅ | ✅ |
| Conditional schemas | ❌ | ⚠️ | ⚠️ |
| Annotations / descriptions | ❌ | ✅ | ✅ |
| String `format` keywords | ❌ | ✅ | ⚠️ registry |

### Engineering

| Capability | `model` | Zod 4 | TypeBox 1.x |
| --- | --- | --- | --- |
| Runtime dependencies | none | none | none |
| ESM-first | ✅ | ✅ | ✅ |
| Tree-shakeable | ✅ small | ✅ `zod/mini` | ✅ modular |
| Browser + Node | ✅ | ✅ | ✅ |
| Ecosystem / adapters | ❌ early | ✅ large | ✅ large |
| Version stability | ❌ experimental | ✅ stable | ✅ stable |

## Where `model` is ahead

1. **Class output, not just shape output.** `User.parse(value)` returns a `User`
   (or subclass) instance. `instanceof` works, subclass methods survive, and
   `new User(value)` validates.
2. **Readonly by construction.** Object/list/record parse output is deeply
   readonly in the type system and frozen at runtime.
3. **Mutation as a first-class operation.** `mutate` produces a new validated
   value, shares unchanged subtrees by reference, and revalidates only changed
   fields. Zod and TypeBox leave updates to userland spread/clone logic.
4. **Nominal parsed values.** Parsed values are branded through internal
   `Model`/`ModelList` base classes, so `mutate` can reject raw objects at
   compile time and runtime.
5. **Invalid-state pressure at authoring time.** `eq` vs bounds, `min`/`gt`,
   `max`/`lt`, nested `length` rules, `pick`/`omit` key checks, enum duplicate
   checks, and the discriminated-union `__type`/`data` wrapper and explicit-key
   requirement are enforced where TypeScript can express them.
6. **Custom top-level types.** `createTypeBuilder` accepts a callback that adds
   scoped constructors composed from built-in types. Built-in string formats and
   `int` use the same path.
7. **Small dependency-free core.** No runtime dependencies and a small API
   surface.

## Where `model` is behind

### 1. Composition

There are no general (non-discriminated) unions, recursive schemas, or
conditional schemas. Tuples, intersections, and discriminated object unions are
supported. Zod and TypeBox still model a wider range of composed data.

### 2. Transforms and coercion

No `transform`, `pipe`, `coerce`, `prefault`, `catch`, or preprocessing.
`.default(value)` is definition-validated and fills `undefined`, but does not
parse/transform the default through a pipeline. `model` remains validation-only
by design.

### 3. Refinements and custom validation

No `refine`, `superRefine`, or arbitrary predicates. Custom top-level types are
compositions of built-in schemas, so they stay JSON-Schema-serializable;
cross-field and domain-specific predicates are still out of scope.

### 4. Exotic types

String formats and integer are built in. No `Date`, `BigInt`, `Map`, `Set`,
`Promise`, functions, or symbols.

### 5. Collection-level constraints

Records have no key schema/pattern; objects have no
`strict`/`passthrough`/`catchall` or object-level validations. Lists support
nested `length` bounds (validated during parse and mutation).

### 6. JSON Schema breadth

`model` emits a subset of JSON Schema: primitives, bounds, patterns, formats,
literals, enums, tuples, arrays, objects, records, `oneOf`/`allOf`/`anyOf`, and
validation defaults. It does not emit `$ref`, conditional schemas, or
annotations, and it cannot consume JSON Schema (whereas TypeBox schemas *are*
JSON Schema).

### 7. Errors and metadata

Issues are simple `{ path, message }` objects. There are no issue codes, union
errors, error maps, descriptions, titles, or registries.

### 8. Performance tooling and ecosystem

No `compile()`/`TypeCompiler` equivalent, no async validation, no adapters
(OpenAPI, tRPC, forms, AI function calling), and no stable API/versioning yet.

## Migration examples

### From Zod

```ts
// Zod
const User = z.object({
  name: z.string().min(1).max(50),
  age: z.number().int().min(0).optional(),
  tags: z.array(z.string()),
})
```

```ts
// model
import { createTypeBuilder } from '@gems-of-ts/model'

const model = createTypeBuilder()

const User = model.object({
  name: model.string({ length: { min: 1, max: 50 } }),
  age: model.int({ min: 0 }).optional(),
  tags: model.list(model.string()),
})
```

`tuple`, discriminated `union`, and `intersection` have direct equivalents.
Unsupported Zod features such as general `z.union`, `z.transform`, `z.refine`,
`z.coerce`, `z.date`, and `z.record(key, value)` have no direct equivalent yet.

### From TypeBox

```ts
// TypeBox
const User = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 50 }),
  age: Type.Optional(Type.Integer({ minimum: 0 })),
  tags: Type.Array(Type.String()),
})
```

```ts
// model
import { createTypeBuilder } from '@gems-of-ts/model'

const model = createTypeBuilder()

const User = model.object({
  name: model.string({ length: { min: 1, max: 50 } }),
  age: model.int({ min: 0 }).optional(),
  tags: model.list(model.string()),
})
```

TypeBox's `$ref`/`Type.Ref`, general `Type.Union`, `Type.Recursive`,
`Value.Parse` pipelines, and `TypeCompiler` are not yet available in `model`;
`Type.Tuple`, `Type.Intersect`, and discriminated object unions are.

### Custom top-level types

`createTypeBuilder` supports scoped custom constructors composed from built-ins:

```ts
const model = createTypeBuilder((tb) => ({
  slug: (validators?: { length?: NumberOptions }) =>
    tb.string({ ...validators, pattern: /^[a-z0-9-]+$/ }),
}))

model.slug({ length: { max: 40 } }).parse('my-post')
```

This is composition-only: custom types must remain expressible as JSON Schema.
There is no equivalent of `z.custom` with an arbitrary predicate or `z.refine`.

## Design constraints / non-goals

- **JSON-Schema-serializable validation.** Arbitrary `refine` predicates are out
  of scope because they cannot be represented as JSON Schema.
- **No coercion or transforms in core.** `model` validates; it does not rewrite
  values.
- **Custom types are composition-only.** They are built from existing schemas so
  they remain serializable; arbitrary predicates belong to `refine`, which is
  out of scope.
- **Frozen output.** Parsed object/list/record values cannot be mutated
  directly; use `mutate`.
- **Class output.** This is a deliberate divergence from Zod/TypeBox, not a
  parity gap to be closed.
- **Two base classes.** Object values extend `Model`; list values extend
  `ModelList` because arrays cannot also extend `Model`. Both share the nominal
  brand used by `mutate`.

## Keeping this document current

When adding a feature, update:

1. the summary matrix;
2. the relevant detailed matrix;
3. the "ahead/behind" sections;
4. the migration examples if the feature closes a common gap.

Verify the comparison against the current Zod and TypeBox documentation before
publishing a release.

## References

- [Zod documentation](https://zod.dev/)
- [Zod 4 changelog](https://zod.dev/v4/changelog)
- [TypeBox repository](https://github.com/sinclairzx81/typebox)
- [TypeBox on npm](https://www.npmjs.com/package/@sinclair/typebox)
