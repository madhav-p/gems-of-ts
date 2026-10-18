import { describe, expect, expectTypeOf, it } from 'vitest'
import { createGrammar, createParser } from '../src'

const query = createGrammar(
  {
    key: /[a-zA-Z_][a-zA-Z0-9_]*/,
    equal: /=/,
    value: /[^,=\s]+/,
    comma: /,/,
  },
  {
    key: (r) => r.token('key'),
    value: (r) => r.token('value'),
    pair: (r) =>
      r.seq({
        key: r.node('key'),
        _equal: r.token('equal'),
        value: r.node('value'),
      }),
    root: (r) => r.list(r.node('pair'), r.token('comma')),
  },
)

const parse = createParser(query)

type Pair = {
  type: 'pair'
  value: {
    key: { type: 'key'; value: string; raw: string }
    value: { type: 'value'; value: string; raw: string }
  }
  raw: string
}

describe('query-string grammar', () => {
  it('parses a single pair', () => {
    expect(parse('a=1')).toEqual({
      type: 'root',
      value: [
        {
          type: 'pair',
          value: {
            key: { type: 'key', value: 'a', raw: 'a' },
            value: { type: 'value', value: '1', raw: '1' },
          },
          raw: 'a=1',
        },
      ],
      raw: 'a=1',
    })
  })

  it('parses a comma-separated list of pairs, ignoring whitespace', () => {
    const result = parse('a=1, b=2 , c=3')
    expect(result.value.map((pair) => pair.value.key.value)).toEqual(['a', 'b', 'c'])
    expect(result.value.map((pair) => pair.value.value.value)).toEqual(['1', '2', '3'])
    expect(result.raw).toBe('a=1, b=2 , c=3')
  })

  it('returns an empty list for an empty input', () => {
    expect(parse('')).toEqual({ type: 'root', value: [], raw: '' })
  })

  it('infers a list-of-pairs AST type', () => {
    expectTypeOf(parse).toMatchTypeOf<(input: string) => { type: 'root'; value: Pair[]; raw: string }>()
  })

  it('rejects a missing value', () => {
    expect(() => parse('a=')).toThrow()
  })
})
