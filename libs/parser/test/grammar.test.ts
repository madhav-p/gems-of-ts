import { describe, expect, expectTypeOf, it } from 'vitest'
import { ParseError, createGrammar, createParser } from '../src'

const csv = createGrammar(
  { word: /[a-z]+/, comma: /,/ },
  {
    word: (r) => r.token('word'),
    root: (r) => r.list(r.node('word'), r.token('comma')),
  },
)

const parse = createParser(csv)

const word = (value: string) => ({ type: 'word' as const, value, raw: value })

describe('lists', () => {
  it('parses zero, one, or many items', () => {
    expect(parse('')).toEqual({ type: 'root', value: [], raw: '' })
    expect(parse('a')).toEqual({ type: 'root', value: [word('a')], raw: 'a' })
    expect(parse('a,b,c')).toEqual({ type: 'root', value: [word('a'), word('b'), word('c')], raw: 'a,b,c' })
  })

  it('ignores whitespace but keeps raw exact', () => {
    expect(parse('  a , b  ')).toEqual({
      type: 'root',
      value: [word('a'), word('b')],
      raw: 'a , b',
    })
  })

  it('reports a trailing delimiter', () => {
    const error = capture(() => parse('a,'))
    expect(error).toBeInstanceOf(ParseError)
    expect((error as ParseError).index).toBe(1)
  })
})

describe('optional fields', () => {
  const optional = createGrammar(
    { word: /[a-z]+/ },
    {
      word: (r) => r.token('word'),
      root: (r) => r.seq({ name: r.node('word'), tag: r.optional(r.node('word')) }),
    },
  )
  const run = createParser(optional)

  it('omits an absent optional field', () => {
    expect(run('abc')).toEqual({ type: 'root', value: { name: word('abc') }, raw: 'abc' })
  })

  it('includes a present optional field', () => {
    expect(run('abc def')).toEqual({
      type: 'root',
      value: { name: word('abc'), tag: word('def') },
      raw: 'abc def',
    })
  })
})

describe('ordered choice', () => {
  const choice = createGrammar(
    { keyword: /let/, identifier: /[a-z]+/ },
    {
      keyword: (r) => r.token('keyword'),
      identifier: (r) => r.token('identifier'),
      root: (r) => r.oneOf({ keyword: r.node('keyword'), identifier: r.node('identifier') }),
    },
  )
  const run = createParser(choice)

  it('takes the first matching alternative', () => {
    expect(run('let')).toEqual({ type: 'keyword', value: 'let', raw: 'let' })
    expect(run('abc')).toEqual({ type: 'identifier', value: 'abc', raw: 'abc' })
  })

  it('does not backtrack once an alternative commits', () => {
    // "letx" matches the keyword "let" first, leaving "x" unconsumed.
    const error = capture(() => run('letx'))
    expect(error).toBeInstanceOf(ParseError)
    expect((error as ParseError).index).toBe(3)
  })
})

describe('transparency', () => {
  const refs = createGrammar(
    { word: /[a-z]+/ },
    {
      word: (r) => r.token('word'),
      alias: (r) => r.node('word'),
      pick: (r) => r.oneOf({ word: r.node('word') }),
      root: (r) => r.node('alias'),
    },
  )

  it('node refs and oneof do not add a wrapper node', () => {
    expect(createParser(refs)('abc')).toEqual({ type: 'word', value: 'abc', raw: 'abc' })
    expect(createParser(refs, 'pick')('abc')).toEqual({ type: 'word', value: 'abc', raw: 'abc' })
  })
})

describe('errors', () => {
  const required = createGrammar(
    { word: /[a-z]+/ },
    {
      word: (r) => r.token('word'),
      root: (r) => r.seq({ a: r.node('word'), b: r.node('word') }),
    },
  )
  const run = createParser(required)

  it('throws ParseError at the offending index', () => {
    const error = capture(() => run('abc 123'))
    expect(error).toBeInstanceOf(ParseError)
    expect((error as ParseError).index).toBe(4)
  })

  it('throws ParseError for empty input', () => {
    const error = capture(() => run(''))
    expect(error).toBeInstanceOf(ParseError)
    expect((error as ParseError).index).toBe(0)
  })
})

describe('refs', () => {
  it('constrains refs to the declared node and token names', () => {
    // @ts-expect-error "nope" is not a declared node name
    csv.rb.node('nope')
    // @ts-expect-error "nope" is not a declared token name
    csv.rb.token('nope')

    expect(csv.rb.node('word').name).toBe('word')
    expectTypeOf(csv.rb.token('word').name).toEqualTypeOf<'word'>()
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
