import { describe, expect, expectTypeOf, it } from 'vitest'
import { createGrammar, createParser } from '../src'

const sexpr = createGrammar(
  {
    lparen: /\(/,
    rparen: /\)/,
    atom: /[^\s()]+/,
  },
  {
    atom: (r) => r.token('atom'),
    list: (r) =>
      r.seq({
        _lparen: r.token('lparen'),
        items: r.optional(r.list(r.node('root'))),
        _rparen: r.token('rparen'),
      }),
    root: (r) => r.oneOf({ atom: r.node('atom'), list: r.node('list') }),
  },
)

const parse = createParser(sexpr)

type SAtom = { type: 'atom'; value: string; raw: string }
type SList = { type: 'list'; value: { items?: SExpr[] | undefined }; raw: string }
type SExpr = SAtom | SList

describe('s-expression grammar', () => {
  it('parses atoms', () => {
    expect(parse('hello')).toEqual({ type: 'atom', value: 'hello', raw: 'hello' })
  })

  it('parses empty and nested lists', () => {
    expect(parse('()')).toEqual({ type: 'list', value: { items: [] }, raw: '()' })
    expect(parse('(a b (c))')).toEqual({
      type: 'list',
      value: {
        items: [
          { type: 'atom', value: 'a', raw: 'a' },
          { type: 'atom', value: 'b', raw: 'b' },
          {
            type: 'list',
            value: { items: [{ type: 'atom', value: 'c', raw: 'c' }] },
            raw: '(c)',
          },
        ],
      },
      raw: '(a b (c))',
    })
  })

  it('infers a recursive AST type', () => {
    expectTypeOf(parse('a')).toMatchTypeOf<SExpr>()
    const typed: (input: string) => SExpr = parse
    expect(typed('()').type).toBe('list')
  })

  it('handles deep nesting', () => {
    const depth = 100
    const input = `${'('.repeat(depth)}x${')'.repeat(depth)}`
    let node: SExpr = parse(input)
    let seen = 0
    while (node.type === 'list') {
      node = node.value.items![0]
      seen += 1
    }
    expect(seen).toBe(depth)
    expect(node).toEqual({ type: 'atom', value: 'x', raw: 'x' })
  })

  it('reports an unbalanced list', () => {
    expect(() => parse('(a b')).toThrow()
  })
})
