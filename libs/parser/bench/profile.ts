/// <reference types="node" />
/**
 * Profiling entrypoint. Run under Node's CPU profiler, e.g.
 *
 *   pnpm --filter @gems-of-ts/parser run profile interpreted 200
 *   pnpm --filter @gems-of-ts/parser run profile compiled 200
 *
 * then analyse the emitted `.cpuprofile` with `scripts/analyze-profile.mjs`.
 */
import { createGrammar, createParser } from '../src'

const json = createGrammar(
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

const mode = process.argv[2] ?? 'interpreted'
const iterations = Number(process.argv[3] ?? 200)

const payload = JSON.stringify(
  Array.from({ length: 200 }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    active: i % 2 === 0,
    tags: ['alpha', 'beta', 'gamma'],
    nested: { x: i, y: i * 2, label: null },
  })),
)

const parse = createParser(json, 'root', { compile: mode === 'compiled' })

let sink = 0
for (let i = 0; i < iterations; i++) {
  const tree = parse(payload)
  sink += (tree as { type: string }).type.length
}
console.log(`${mode}: ${iterations} iterations of ${payload.length} bytes (sink ${sink})`)
