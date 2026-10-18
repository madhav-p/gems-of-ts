import { describe, expect, expectTypeOf, it } from 'vitest'
import { createGrammar, createParser } from '../src'

const JSONGrammar = createGrammar(
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

const parse = createParser(JSONGrammar)

type Str = { type: 'string'; value: string; raw: string }
type JsonNode =
  | { type: 'null'; value: string; raw: string }
  | { type: 'boolean'; value: string; raw: string }
  | { type: 'number'; value: string; raw: string }
  | Str
  | { type: 'array'; value: { items?: JsonNode[] | undefined }; raw: string }
  | {
      type: 'object'
      value: { properties?: { key: Str; value: JsonNode }[] | undefined }
      raw: string
    }

describe('grammar refs', () => {
  it('constrains refs to the declared node and token names', () => {
    // @ts-expect-error "missing" is not a declared node name
    JSONGrammar.rb.node('missing')
    // @ts-expect-error "missing" is not a declared token name
    JSONGrammar.rb.token('missing')

    expect(JSONGrammar.rb.node('root').name).toBe('root')
  })
})

describe('json grammar', () => {
  it('infers a discriminated AST type from the grammar', () => {
    // The inferred AST is assignable to the hand-written discriminated union.
    const typed: (input: string) => JsonNode = parse
    expect(typed).toBe(parse)
    expectTypeOf(parse('42')).toMatchTypeOf<JsonNode>()
  })

  it('leaves literal nodes as { type, value, raw }', () => {
    expect(parse('null')).toEqual({ type: 'null', value: 'null', raw: 'null' })
    expect(parse('true')).toEqual({ type: 'boolean', value: 'true', raw: 'true' })
    expect(parse('42')).toEqual({ type: 'number', value: '42', raw: '42' })
    expect(parse('"hi"')).toEqual({ type: 'string', value: '"hi"', raw: '"hi"' })
  })

  it('nests composite nodes with their source slice as raw', () => {
    expect(parse('[1,2]')).toEqual({
      type: 'array',
      value: {
        items: [
          { type: 'number', value: '1', raw: '1' },
          { type: 'number', value: '2', raw: '2' },
        ],
      },
      raw: '[1,2]',
    })
    expect(parse('[]')).toEqual({ type: 'array', value: { items: [] }, raw: '[]' })
  })

  it('parses objects with nested values', () => {
    expect(parse('{"a":1}')).toEqual({
      type: 'object',
      value: {
        properties: [
          {
            key: { type: 'string', value: '"a"', raw: '"a"' },
            value: { type: 'number', value: '1', raw: '1' },
          },
        ],
      },
      raw: '{"a":1}',
    })
  })

  it('emits raw without surrounding insignificant whitespace', () => {
    expect(parse('  { "a" : 1 } ')).toEqual({
      type: 'object',
      value: {
        properties: [
          {
            key: { type: 'string', value: '"a"', raw: '"a"' },
            value: { type: 'number', value: '1', raw: '1' },
          },
        ],
      },
      raw: '{ "a" : 1 }',
    })
  })

  it('rejects trailing input', () => {
    expect(() => parse('null null')).toThrow()
  })

  it('narrows value via switch on type', () => {
    function label(node: JsonNode): string {
      switch (node.type) {
        case 'null':
          return 'null'
        case 'boolean':
          return `boolean:${node.value}`
        case 'number':
          return `number:${node.value}`
        case 'string':
          return `string:${node.value}`
        case 'array':
          return `array:${node.value.items?.length ?? 0}`
        case 'object':
          return `object:${node.value.properties?.length ?? 0}`
      }
    }

    expect(label(parse('42'))).toBe('number:42')
    expect(label(parse('[true,null]'))).toBe('array:2')
    expect(label(parse('{"a":1}'))).toBe('object:1')
  })
})

