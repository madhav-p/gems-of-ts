import { describe, expect, expectTypeOf, it } from 'vitest'
import { createGrammar, createParser } from '../src'

const g = createGrammar(
  {
    number: /\d+/,
    comma: /,/,
    leftBrace: /\{/,
    rightBrace: /\}/,
    colon: /:/,
    key: /[a-z]+/,
  },
  {
    number: (r) => r.token('number'),
    key: (r) => r.token('key'),
    value: (r) => r.oneOf({ number: r.node('number'), object: r.node('object') }),
    object: (r) =>
      r.seq({
        _leftBrace: r.token('leftBrace'),
        entries: r.optional(
          r.list(
            r.seq({
              key: r.node('key'),
              _colon: r.token('colon'),
              value: r.node('value'),
            }),
            r.token('comma'),
          ),
        ),
        _rightBrace: r.token('rightBrace'),
      }),
    root: (r) => r.node('value'),
  },
)

const interpreted = createParser(g)
const compiled = createParser(g, 'root', { compile: true })
const interpretedLoc = createParser(g, 'root', { location: true })
const compiledLoc = createParser(g, 'root', { compile: true, location: true })

function assertLocations(node: unknown, input: string): void {
  if (node === null || typeof node !== 'object') {
    return
  }
  const record = node as Record<string, unknown>
  if (typeof record.type === 'string' && record.location !== undefined) {
    const location = record.location as { start: number; end: number }
    expect(input.slice(location.start, location.end)).toBe(record.raw)
  }
  for (const key of Object.keys(record)) {
    if (key === 'location') {
      continue
    }
    const child = record[key]
    if (Array.isArray(child)) {
      for (const item of child) {
        assertLocations(item, input)
      }
    } else {
      assertLocations(child, input)
    }
  }
}

describe('location', () => {
  it('attaches offsets to every node', () => {
    const node = interpretedLoc('{a:1}')
    expect(node.type).toBe('object')
    expect(node.location).toEqual({ start: 0, end: 5 })
    expect(node.raw).toBe('{a:1}')

    if (node.type === 'object') {
      const entry = node.value.entries?.[0]
      expect(entry?.key.location).toEqual({ start: 1, end: 2 })
      expect(entry?.value.location).toEqual({ start: 3, end: 4 })
    }
  })

  it('keeps raw consistent with location for every node', () => {
    const input = '{a:1,b:{c:2}}'
    assertLocations(interpretedLoc(input), input)
  })

  it('adds location to the AST type only when requested', () => {
    expectTypeOf(interpretedLoc('1')).toHaveProperty('location')
    expectTypeOf(interpreted('1')).not.toHaveProperty('location')
  })
})

describe('compile', () => {
  it('produces identical output to the interpreter', () => {
    const inputs = ['1', '{}', '{a:1}', '{a:1,b:{c:2}}', '{a:1,b:{c:2},d:{e:{f:3}}}']
    for (const input of inputs) {
      expect(compiled(input)).toEqual(interpreted(input))
      expect(compiledLoc(input)).toEqual(interpretedLoc(input))
    }
  })

  it('does not change the inferred AST type', () => {
    // `compiled` and `interpreted` must have the exact same signature.
    const typecheck: typeof interpreted = compiled
    expect(typecheck).toBe(compiled)
  })

  it('agrees with the interpreter on failure', () => {
    for (const input of ['{a:}', '{', '}', '{a:1', '{a 1}']) {
      const interpretedError = capture(() => interpreted(input))
      const compiledError = capture(() => compiled(input))
      expect(interpretedError).toBeInstanceOf(Error)
      expect(compiledError).toBeInstanceOf(Error)
      expect((compiledError as Error).constructor).toBe((interpretedError as Error).constructor)
    }
  })
})

function capture(run: () => unknown): unknown {
  try {
    run()
    return undefined
  } catch (error) {
    return error
  }
}
