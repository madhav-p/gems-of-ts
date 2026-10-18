import { describe, expect, it } from 'vitest'
import { createGrammar, createParser } from '../src'

const toml = createGrammar(
  {
    comment: /#[^\n]*/,
    key: /[A-Za-z0-9_-]+/,
    dot: /\./,
    equal: /=/,
    string: /"(?:\\.|[^"\\])*"/,
    float: /-?\d+\.\d+/,
    integer: /-?\d+/,
    boolean: /true|false/,
    leftBracket: /\[/,
    rightBracket: /\]/,
    comma: /,/,
  },
  {
    string: (r) => r.token('string'),
    float: (r) => r.token('float'),
    integer: (r) => r.token('integer'),
    boolean: (r) => r.token('boolean'),
    key: (r) => r.token('key'),
    keyPath: (r) => r.list(r.node('key'), r.token('dot')),
    array: (r) =>
      r.seq({
        _leftBracket: r.token('leftBracket'),
        values: r.optional(r.list(r.node('value'), r.token('comma'))),
        _rightBracket: r.token('rightBracket'),
      }),
    value: (r) =>
      r.oneOf({
        string: r.node('string'),
        float: r.node('float'),
        integer: r.node('integer'),
        boolean: r.node('boolean'),
        array: r.node('array'),
      }),
    pair: (r) =>
      r.seq({
        key: r.node('keyPath'),
        _equal: r.token('equal'),
        value: r.node('value'),
        _comment: r.optional(r.token('comment')),
      }),
    table: (r) =>
      r.seq({
        _leftBracket: r.token('leftBracket'),
        name: r.node('keyPath'),
        _rightBracket: r.token('rightBracket'),
        _comment: r.optional(r.token('comment')),
      }),
    commentLine: (r) => r.seq({ text: r.token('comment') }),
    statement: (r) =>
      r.oneOf({
        comment: r.node('commentLine'),
        table: r.node('table'),
        pair: r.node('pair'),
      }),
    root: (r) => r.list(r.node('statement')),
  },
)

const parse = createParser(toml)

describe('toml grammar', () => {
  it('parses scalar pairs', () => {
    expect(parse('title = "TOML"\nport = 8000\nactive = true')).toEqual({
      type: 'root',
      value: [
        {
          type: 'pair',
          value: {
            key: {
              type: 'keyPath',
              value: [{ type: 'key', value: 'title', raw: 'title' }],
              raw: 'title',
            },
            value: { type: 'string', value: '"TOML"', raw: '"TOML"' },
          },
          raw: 'title = "TOML"',
        },
        {
          type: 'pair',
          value: {
            key: {
              type: 'keyPath',
              value: [{ type: 'key', value: 'port', raw: 'port' }],
              raw: 'port',
            },
            value: { type: 'integer', value: '8000', raw: '8000' },
          },
          raw: 'port = 8000',
        },
        {
          type: 'pair',
          value: {
            key: {
              type: 'keyPath',
              value: [{ type: 'key', value: 'active', raw: 'active' }],
              raw: 'active',
            },
            value: { type: 'boolean', value: 'true', raw: 'true' },
          },
          raw: 'active = true',
        },
      ],
      raw: 'title = "TOML"\nport = 8000\nactive = true',
    })
  })

  it('parses arrays, tables, comments and blank lines', () => {
    const source = ['# config', 'ports = [8000, 8001]', '', '[server]', 'host = "localhost"'].join(
      '\n',
    )
    const result = parse(source)

    expect(result.value.map((statement) => statement.type)).toEqual([
      'commentLine',
      'pair',
      'table',
      'pair',
    ])

    const array = result.value[1]
    expect(array.type).toBe('pair')
    if (array.type === 'pair') {
      expect(array.value.value).toEqual({
        type: 'array',
        value: {
          values: [
            { type: 'integer', value: '8000', raw: '8000' },
            { type: 'integer', value: '8001', raw: '8001' },
          ],
        },
        raw: '[8000, 8001]',
      })
    }

    const table = result.value[2]
    expect(table.type).toBe('table')
    if (table.type === 'table') {
      expect(table.value.name.value.map((key) => key.value)).toEqual(['server'])
    }
  })

  it('parses dotted keys', () => {
    const result = parse('[a.b]\nx = 1')
    const table = result.value[0]
    expect(table.type).toBe('table')
    if (table.type === 'table') {
      expect(table.value.name.value.map((key) => key.value)).toEqual(['a', 'b'])
    }
  })

  it('infers a discriminated statement union', () => {
    const first = parse('a = 1').value[0]!
    if (first.type === 'pair') {
      // `first.value.key` is a keyPath node; `.value` is the key list.
      expect(first.value.key.value[0]!.value).toBe('a')
      expect(first.value.value.type).toBe('integer')
    } else {
      throw new Error(`expected a pair, got ${first.type}`)
    }
  })

  it('rejects a missing value', () => {
    expect(() => parse('key =')).toThrow()
  })
})
