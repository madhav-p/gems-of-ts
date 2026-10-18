# @gems-of-ts/parser

A tiny, dependency-free **grammar DSL** that turns text into a **discriminated AST
whose TypeScript type is inferred from the grammar itself**.

You describe a language as data — a table of tokens (regexes) and a table of nodes
(rules) — and the parser gives you back a `{ type, value, raw }` tree that you can
`switch` on with full type narrowing. No code generation, no build step, no runtime
dependencies, and **no hand-written AST types**.

```ts
const parse = createParser(JSONGrammar)

const node = parse('{"a":1}')
if (node.type === 'object') {
  node.value.properties?.[0]?.value.type // 'number' | 'string' | ...
}
```

---

## Table of contents

- [Why](#why)
- [Install](#install)
- [Quick start](#quick-start)
- [Concepts](#concepts)
  - [Tokens](#tokens)
  - [Nodes and rules](#nodes-and-rules)
  - [The AST output](#the-ast-output)
  - [Transparency](#transparency)
  - [Whitespace](#whitespace)
  - [Backtracking and ordered choice](#backtracking-and-ordered-choice)
  - [Errors](#errors)
  - [Source locations](#source-locations)
  - [Compiling](#compiling)
- [Type inference](#type-inference)
- [Examples](#examples)
- [API reference](#api-reference)
- [Performance](#performance)
- [How it compares](#how-it-compares)
- [Limitations and roadmap](#limitations-and-roadmap)

---

## Why

Most parsers give you one of two things:

1. **Control** — you hand-write a recursive-descent parser, and every AST type is
   written and maintained by hand.
2. **Declarative grammar** — PEG/nearley/Ohm give you a grammar file, but the output
   is `any`/`unknown`, so you bolt on types afterwards.

This library tries to give you both: **declare the grammar once, and get a precise,
narrow-able AST type for free.** It is intentionally small — the whole engine is a
few hundred lines — because the interesting part is the type inference.

---

## Install

```sh
pnpm add @gems-of-ts/parser
```

Requires a modern TypeScript (developed and tested against TypeScript 7 with
`strict` on) and an ESM runtime.

---

## Quick start

```ts
import { createGrammar, createParser } from '@gems-of-ts/parser'

const json = createGrammar(
  /* tokens: name -> RegExp */
  {
    null: /null/,
    boolean: /true|false/,
    number: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/,
    string: /"(?:\\["\\/bfnrt]|\\u[0-9a-fA-F]{4}|[^"\\])*"/,
    leftSquareBracket: /\[/,
    rightSquareBracket: /\]/,
    leftCurlyBracket: /\{/,
    rightCurlyBracket: /\}/,
    colon: /:/,
    comma: /,/,
  },
  /* nodes: name -> (r) => Rule */
  {
    null: (r) => r.token('null'),
    boolean: (r) => r.token('boolean'),
    number: (r) => r.token('number'),
    string: (r) => r.token('string'),

    array: (r) =>
      r.seq({
        _leftSquareBracket: r.token('leftSquareBracket'),
        items: r.optional(r.list(r.node('root'), r.token('comma'))),
        _rightSquareBracket: r.token('rightSquareBracket'),
      }),

    object: (r) =>
      r.seq({
        _leftCurlyBracket: r.token('leftCurlyBracket'),
        properties: r.optional(
          r.list(
            r.seq({
              key: r.node('string'),
              _colon: r.token('colon'),
              value: r.node('root'),
            }),
            r.token('comma'),
          ),
        ),
        _rightCurlyBracket: r.token('rightCurlyBracket'),
      }),

    root: (r) =>
      r.oneOf({
        null: r.node('null'),
        boolean: r.node('boolean'),
        number: r.node('number'),
        string: r.node('string'),
        array: r.node('array'),
        object: r.node('object'),
      }),
  },
)

const parse = createParser(json)

parse('42')
// { type: 'number', value: '42', raw: '42' }

parse('{"a":[1,true]}')
// {
//   type: 'object',
//   value: { properties: [
//     { key: { type: 'string', value: '"a"', raw: '"a"' },
//       value: { type: 'array', value: { items: [
//         { type: 'number', value: '1', raw: '1' },
//         { type: 'boolean', value: 'true', raw: 'true' },
//       ] }, raw: '[1,true]' } },
//   ] },
//   raw: '{"a":[1,true]}',
// }
```

That's the whole API. The AST type above is inferred — nothing was annotated.
Two optional settings tweak it: `{ location: true }` adds source offsets to every
node, and `{ compile: true }` builds a faster, specialized parser — see
[Source locations](#source-locations) and [Compiling](#compiling).

---

## Concepts

### Tokens

A token is a `RegExp`, matched against the input at the current position with the
sticky (`y`) flag. Tokens are the leaves of your grammar:

```ts
{ integer: /\d+/, plus: /\+/ }
```

A token produces a node `{ type: <tokenName>, value: <matched text>, raw: <matched text> }`.

> Tokens currently carry no decoder, so `value` is the raw matched text. See
> [Limitations](#limitations-and-roadmap).

### Nodes and rules

A node is a named rule. The builder receives a `RefBuilder` `r` and returns a rule:

| Builder | Meaning | AST value |
| --- | --- | --- |
| `r.token(name)` | match a token | token node |
| `r.node(name)` | reference another node (recursion) | that node's AST |
| `r.seq({ ... })` | all fields in order | object of the non-`_` fields |
| `r.oneOf({ ... })` | try alternatives in order, first wins | the chosen node |
| `r.optional(rule)` | match zero or one | value or `undefined` |
| `r.list(item, delim?)` | zero or more, optionally delimited | array |

- Fields whose name starts with `_` are **structural** and dropped from the AST
  (e.g. `_leftCurlyBracket`, `_colon`).
- `r.token`/`r.node` only accept names declared in the same grammar, so
  `r.node('typo')` is a **compile error**.

### The AST output

Every node is an `AstNode<T, V>`:

```ts
type AstNode<T extends string, V> = {
  readonly type: T   // the grammar node/token name
  readonly value: V  // the semantic value (children, or the matched text)
  readonly raw: string // the exact source slice this node consumed
}
```

Because `type` is a literal discriminant, `switch (node.type)` narrows `value`:

```ts
function describe(node: JsonNode): string {
  switch (node.type) {
    case 'number':
      return `number ${node.value}` // value: string
    case 'array':
      return `array of ${node.value.items?.length ?? 0}` // value: { items?: JsonNode[] }
    case 'object':
      return `object with ${node.value.properties?.length ?? 0} keys`
    // ...exhaustive; a `default` is not required
  }
}
```

`raw` is the source text, so you get both the parsed value **and** exact source
spans for free (useful for highlighting, pretty-printing, error messages).

### Transparency

Two rule kinds do **not** add a wrapper node:

- **`r.node(name)`** is an alias — `root: r => r.node('element')` yields the
  `element` node directly.
- **`r.oneOf(...)`** yields whichever alternative matched.

So `root` never shows up as a synthetic node; the AST is exactly the nodes you
declared. Structural `seq` produces a plain, anonymous object:

```ts
{ key: <string node>, value: <root node> } // an object property entry
```

### Whitespace

Insignificant whitespace is skipped before every token, and `raw` excludes
surrounding whitespace. By default "whitespace" means `\s` — including newlines —
which makes JSON/XML/S-expression grammars "just work".

Line-oriented formats (YAML block style, TOML) can make newlines significant by
passing an `ignore` pattern that excludes them:

```ts
createGrammar(tokens, nodes, { ignore: /[^\S\n]*/ }) // skip spaces/tabs, keep \n
```

Formats where whitespace is genuinely significant (CSV, Python-style
indentation) remain out of scope.

### Backtracking and ordered choice

`oneOf` tries alternatives left to right and backtracks on failure. Once an
alternative succeeds, it **commits** — the parser does not re-try a later
alternative on a subsequent failure. Order alternatives from most to least
specific.

`list` matches zero or more items; with a delimiter it parses `item (delim item)*`.
Because zero items is a successful match, `optional(list(...))` always yields an
array (possibly empty) rather than `undefined`.

### Errors

On failure the parser throws a `ParseError`:

```ts
class ParseError extends Error {
  readonly expected: string // the token name (or 'end of input' / 'one of')
  readonly index: number    // 0-based offset into the input
}
```

### Source locations

Pass `{ location: true }` to attach a `location: { start, end }` (0-based character
offsets) to **every** node. `raw` is always `input.slice(start, end)`.

```ts
const parse = createParser(grammar, 'root', { location: true })

parse('{a:1}')
// { type: 'object', value: { ... }, raw: '{a:1}', location: { start: 0, end: 5 } }
```

The inferred type tracks this: with `location: true` the AST is
`AstNode<T, V, true>` (has `location`); otherwise `AstNode<T, V, false>` (does
not). There is no runtime cost to speak of (see [Performance](#performance)).

### Compiling

Pass `{ compile: true }` to build a **specialized parser** ahead of time, like
zod/TypeBox's compile step. Instead of interpreting the rule tree on every run —
re-invoking each node's builder, walking `seq` fields, and switching on
`rule.type` — the compiler resolves every node and rule **once** into a graph of
closures.

```ts
const parse = createParser(grammar, 'root', { compile: true })
```

Same input, same output *type*, same `ParseError`s — just faster (measured
~1.3× on a JSON workload; see [Performance](#performance)). `location` composes
with it.

---

## Type inference

The AST type is computed by a small type-level interpreter that mirrors the runtime:

```ts
type Ast<R, Ns>       // value type of a rule R against the node table Ns
type AstOf<Ns, N>     // the AST node produced by node N
```

You rarely name these directly, but they are exported for advanced use. The
inferred type is a **recursive discriminated union** and is assignable to a
hand-written equivalent:

```ts
type JsonNode =
  | { type: 'null'; value: string; raw: string }
  | { type: 'boolean'; value: string; raw: string }
  | { type: 'number'; value: string; raw: string }
  | { type: 'string'; value: string; raw: string }
  | { type: 'array'; value: { items?: JsonNode[] | undefined }; raw: string }
  | { type: 'object'; value: { properties?: { key: ...; value: JsonNode }[] | undefined }; raw: string }

const typed: (input: string) => JsonNode = parseJson // ✅
```

---

## Examples

The test suite contains full, tested grammars you can copy:

| Grammar | Shows off | File |
| --- | --- | --- |
| **JSON** | `oneOf`, recursion, `optional(list(...))`, tagged output | `test/json.test.ts` |
| **XML** | nested elements, attributes, `list` without a delimiter | `test/xml.test.ts` |
| **S-expressions** | deep recursion, `oneOf` at the root | `test/sexpr.test.ts` |
| **semver** | optional segments, delimited lists | `test/semver.test.ts` |
| **query string** | a `list` as the root rule, `= `-separated pairs | `test/query.test.ts` |
| **TOML** | tables, dotted keys, arrays, comments | `test/toml.test.ts` |
| **YAML** | flow collections + flat block mappings/sequences, newline-significant lexing | `test/yaml.test.ts` |

A minimal one:

```ts
const csv = createGrammar(
  { word: /[a-z]+/, comma: /,/ },
  {
    word: (r) => r.token('word'),
    root: (r) => r.list(r.node('word'), r.token('comma')),
  },
)

createParser(csv)('a,b,c')
// { type: 'root', value: [
//   { type: 'word', value: 'a', raw: 'a' },
//   { type: 'word', value: 'b', raw: 'b' },
//   { type: 'word', value: 'c', raw: 'c' },
// ], raw: 'a,b,c' }
```

---

## API reference

### `createGrammar(tokens, nodes, options?)`

```ts
const grammar = createGrammar(
  tokens: Record<TokenName, RegExp>,
  nodes: Record<NodeName, (r: RefBuilder) => Rule>,
  options?: GrammarOptions, // { ignore?: RegExp }
)
```

Returns a `Grammar` carrying `tokens`, `rb` (a `RefBuilder`), `nodes` and the
resolved `ignore` pattern. Node and token names are inferred as literal unions, so
refs are checked. `options.ignore` sets the insignificant-whitespace pattern (see
[Whitespace](#whitespace)); it defaults to `/\s*/`.

### `createParser(grammar, nodeName?, options?)`

```ts
const parse = createParser(grammar, 'root', {
  location: true, // attach `location: { start, end }` to every node
  compile: true,  // precompute a specialized parser
})
parse(input: string): AstOf<Nodes, NodeName, Location>
```

Returns a function `(input: string) => <inferred AST>`. Parses from the given node
(not necessarily the root) and throws `ParseError` on failure. Both options are
independent: `location` affects the output type, `compile` only affects speed.

### `RefBuilder`

```ts
r.token(name)          // TokenRef
r.node(name)           // NodeRef
r.seq({ field: rule }) // SeqRule
r.oneOf({ alt: rule }) // OneOfRule
r.optional(rule)       // OptionalRule
r.list(item, delim?)   // ListRule
```

### Exported types

`AstNode` (with optional `location`), `SourceLocation`, `Ast`, `AstOf`, `Grammar`,
`GrammarOptions`, `ParserOptions`, `Rule`, `TokenRef`, `NodeRef`, `SeqRule`,
`OneOfRule`, `OptionalRule`, `ListRule`, `ParseError`.

---

## Performance

`createParser(grammar, nodeName, { compile: true })` builds the parser once
instead of interpreting the rule tree per run. Measured on a JSON workload (100
records, ~11 KB, 150 iterations, Node 24 on an arm64 Mac, via
`pnpm --filter @gems-of-ts/parser bench`):

| variant | ops/sec | ms/op | vs interpreted |
| --- | ---: | ---: | ---: |
| interpreted | 675 | 1.48 | 1.00× |
| **compiled** | **891** | **1.12** | **1.32×** |
| interpreted + location | 675 | 1.48 | 1.00× |
| compiled + location | 887 | 1.13 | 1.31× |
| `JSON.parse` (native) | 29414 | 0.034 | 43.6× |

Takeaways:

- **Compiling matters** — roughly **1.3×** here, from skipping the per-visit rule
  dispatch (`Object.entries`, `rule.type` switch, re-invoking node builders).
- **`location` is effectively free** — one extra object field per node.
- Both variants are within a small constant factor of a native parser.

### How we got here (CPU profile)

The first profiling run showed the cost was almost entirely **not** parsing:

| self time | function |
| ---: | --- |
| ~90% | `MatchError` — the backtracking signal |

`MatchError` extended `Error`, so every failed `oneOf` alternative threw an error
that captured a stack trace. `oneOf` fails constantly during ordered choice, so
that stack capture dominated everything. Making `MatchError` a **plain class**
(not an `Error`) removed it, and the whole parser got ~**20× faster**
(interpreted 34 → 675 ops/sec). Re-profiling then showed the time shifted to real
work — `matchToken` (~33%), rule dispatch (~29%) and `skipWhitespace` (~12%) for
the interpreter, and `matchToken` (~39%) + compiled closures for the compiled one.

Run it yourself:

```sh
pnpm --filter @gems-of-ts/parser bench      # throughput
pnpm --filter @gems-of-ts/parser run profile interpreted 400
node scripts/analyze-profile.mjs <file>.cpuprofile
```

---

## How it compares

### Feature matrix

| | Grammar is | Output type | Discriminated narrowing | Build step | Runtime deps |
| --- | --- | --- | --- | --- | --- |
| **Hand-written recursive descent** | imperative code | hand-written | manual | no | none |
| **Parsimmon / arcsecond** (combinators) | JS function composition | inferred per combinator; AST assembled by hand with `.map` | only if you tag manually | no | small |
| **Peggy** (PEG.js) | `.pegjs` grammar + JS actions | `any` (or generated `.d.ts`) | no | codegen | dev-only |
| **nearley** | `.ne` grammar + postprocessors | `any` | no | codegen | dev + runtime |
| **Chevrotain** | imperative token + rule definitions | typed via generics, but verbose | possible | no | runtime |
| **Ohm-js** | Ohm grammar + semantic actions | `any` (semantic actions) | no | no | runtime |
| **@gems-of-ts/parser** | declarative JS object (`tokens` + `nodes`) | **inferred from the grammar** | **native** | no | **none** |

### Complexity and verbosity

- **vs. hand-written parsers** — no contest. You declare *what* the grammar is, not
  *how* to consume it. There is no cursor bookkeeping, no back-tracking code, no
  manual "expected token" plumbing.
- **vs. parser combinators (Parsimmon, arcsecond)** — combinators are powerful and
  precise, but you build the AST yourself with `.map(...)` at every step, and the
  result types are whatever your mapping functions return. A JSON grammar is
  noticeably longer, and the nesting/typing is on you. Here the shape *is* the
  grammar.
- **vs. PEG/nearley/Ohm** — comparable declarativeness, but those need a separate
  grammar file, a code-generation step, and they hand you back untyped values.
  This is a plain object literal checked by `tsc`, with a typed AST.
- **vs. Chevrotain** — Chevrotain is built for speed and large real-world grammars,
  with excellent error recovery; it is correspondingly more code to write. This is a
  small, ergonomic tool for small-to-medium languages.

### Ease of use of the output

This is the main differentiator. Typical output for "a JSON number" is:

```ts
// This library
{ type: 'number', value: '42', raw: '42' }

// PEG/nearley/Ohm: typically a plain value...
42 // ...typed `any`, with no notion of node type or source span
```

Because nodes are a discriminated union, you consume them with exhaustive
`switch`es and the compiler checks you handled every case — and because each node
carries `raw`, you keep the source text without threading positions yourself.

### Honest trade-offs

You give up: token value decoding, left recursion / operator associativity, custom
error recovery, whitespace tuning, and peak performance. See below.

---

## Limitations and roadmap

- **Tokens are stringly-typed.** `value` is the matched text; `{ type: 'number', value: '42' }`,
  not `42`. *Roadmap: an optional decoder per token, threaded through `Ast`.*
- **No left recursion / associativity.** Rules must be right-recursive. Operator
  precedence (e.g. `1 + 2 * 3`) needs to be encoded with explicit nodes; a `list`
  delimiter is a single token and is discarded, so it can't capture operators.
- **Whitespace is insignificant by default.** You can make newlines significant
  via `ignore`, but genuinely whitespace-sensitive formats (CSV, indentation-based
  nesting) are not supported. The bundled YAML grammar is a subset (flow
  collections + a flat block layer; no indentation nesting).
- **`list` delimiter is a single token and is not captured.**
- **Backtracking via thrown signals.** `oneOf` backtracks by throwing a
  lightweight `MatchError` (a plain object, *not* an `Error`, so no stack capture)
  and catching it. Worst case is exponential; fine for small grammars, not for
  adversarial input. See [Performance](#performance).
- **Coarse errors.** A single `expected` name + `index`; no recovery, no error list.
- **Locations are offsets only.** With `{ location: true }` you get `{ start, end }`
  character offsets — no line/column, no `loc` object.
- **Recursive-descent depth.** Very deeply nested input is bounded by the JS stack.

---

## Development

```sh
pnpm --filter @gems-of-ts/parser test        # run the grammar test suites
pnpm --filter @gems-of-ts/parser typecheck   # includes the type-level assertions
pnpm --filter @gems-of-ts/parser bench       # interpreted vs compiled benchmark
```
