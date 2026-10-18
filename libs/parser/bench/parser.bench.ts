/// <reference types="node" />
import { performance } from 'node:perf_hooks'
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

const RECORDS = 100
const payload = JSON.stringify(
  Array.from({ length: RECORDS }, (_, i) => ({
    id: i,
    name: `item-${i}`,
    active: i % 2 === 0,
    tags: ['alpha', 'beta', 'gamma'],
    nested: { x: i, y: i * 2, label: null },
  })),
)

const interpreted = createParser(json)
const compiled = createParser(json, 'root', { compile: true })
const interpretedLoc = createParser(json, 'root', { location: true })
const compiledLoc = createParser(json, 'root', { compile: true, location: true })

// Sanity: compiled output must be identical to interpreted output.
const assertEqual = (a: unknown, b: unknown, label: string) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`output mismatch: ${label}`)
  }
}
assertEqual(interpreted(payload), compiled(payload), 'payload')
assertEqual(interpretedLoc(payload), compiledLoc(payload), 'payload+location')

type Measurement = { name: string; opsPerSecond: number; msPerOp: number }

function measure(name: string, fn: () => unknown, iterations: number): Measurement {
  const warmup = Math.max(5, Math.floor(iterations / 10))
  for (let i = 0; i < warmup; i++) {
    fn()
  }
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    fn()
  }
  const ms = performance.now() - start
  return { name, opsPerSecond: (iterations / ms) * 1000, msPerOp: ms / iterations }
}

const ITERATIONS = 150

const results: Measurement[] = [
  measure('interpreted', () => interpreted(payload), ITERATIONS),
  measure('compiled', () => compiled(payload), ITERATIONS),
  measure('interpreted + location', () => interpretedLoc(payload), ITERATIONS),
  measure('compiled + location', () => compiledLoc(payload), ITERATIONS),
  measure('JSON.parse (native)', () => JSON.parse(payload), ITERATIONS),
]

const baseline = results[0]!.opsPerSecond
const pad = (value: string, width: number) => value.padEnd(width)
const padLeft = (value: string, width: number) => value.padStart(width)

console.log(`\nJSON payload: ${RECORDS} objects, ${payload.length} bytes, ${ITERATIONS} iterations\n`)
console.log(
  `${pad('variant', 24)}${padLeft('ops/sec', 12)}${padLeft('ms/op', 10)}${padLeft('vs interpreted', 16)}`,
)
console.log('-'.repeat(62))
for (const result of results) {
  const speedup = (result.opsPerSecond / baseline).toFixed(2)
  console.log(
    `${pad(result.name, 24)}${padLeft(result.opsPerSecond.toFixed(0), 12)}${padLeft(
      result.msPerOp.toFixed(4),
      10,
    )}${padLeft(`${speedup}x`, 16)}`,
  )
}
console.log()
