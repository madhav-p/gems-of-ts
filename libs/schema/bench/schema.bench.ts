/// <reference types="node" />
import { performance } from 'node:perf_hooks'
import { createSchemaBuilder } from '../src'

const t = createSchemaBuilder()
const { array, number, object, string } = t

const nonEmptyString = () => string((sv) => sv.length((nv) => nv.min(1)))

class Address extends object({
  street: nonEmptyString(),
  city: nonEmptyString(),
}) {}

class User extends object({
  id: number((nv) => nv.format('int')),
  name: nonEmptyString(),
  email: string((sv) => sv.format('email')),
  age: number((nv) => nv.format('int').min(0)).optional(),
  address: Address,
  tags: array(nonEmptyString()),
}) {}

const payload = {
  id: 1,
  name: 'Ada',
  email: 'ada@example.com',
  age: 36,
  address: { street: '1 Main St', city: 'Springfield' },
  tags: ['admin', 'user', 'staff'],
}

const parsed = User.parse(payload)
const compiled = User.compile()
if (JSON.stringify(compiled(payload)) !== JSON.stringify(parsed)) {
  throw new Error('compiled output differs from parse')
}
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

const ITERATIONS = 100_000

const results: Measurement[] = [
  measure('parse (raw)', () => User.parse(payload), ITERATIONS),
  measure('parse (parsed)', () => User.parse(parsed), ITERATIONS),
  measure('safeParse (raw)', () => User.safeParse(payload), ITERATIONS),
  measure('compile()', () => compiled(payload), ITERATIONS),
]

const baseline = results[0]!.opsPerSecond
const pad = (value: string, width: number) => value.padEnd(width)
const padLeft = (value: string, width: number) => value.padStart(width)

console.log(`\nUser schema validation — ${ITERATIONS.toLocaleString()} iterations\n`)
console.log(
  `${pad('variant', 20)}${padLeft('ops/sec', 12)}${padLeft('ms/op', 10)}${padLeft('vs parse (raw)', 16)}`,
)
console.log('-'.repeat(58))
for (const result of results) {
  console.log(
    `${pad(result.name, 20)}${padLeft(result.opsPerSecond.toFixed(0), 12)}${padLeft(
      result.msPerOp.toFixed(4),
      10,
    )}${padLeft(`${(result.opsPerSecond / baseline).toFixed(2)}x`, 16)}`,
  )
}
console.log()
