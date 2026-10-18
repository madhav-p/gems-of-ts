import { describe, expect, it } from 'vitest'
import { createGrammar, createParser } from '../src'

const yaml = createGrammar(
  {
    newline: /\n/,
    comment: /#[^\n]*/,
    dash: /-/,
    colon: /:/,
    comma: /,/,
    leftBrace: /\{/,
    rightBrace: /\}/,
    leftBracket: /\[/,
    rightBracket: /\]/,
    doubleQuoted: /"(?:\\.|[^"\\])*"/,
    singleQuoted: /'[^']*'/,
    plain: /[^\s,[\]{}:#]+/,
    number: /-?\d+(\.\d+)?/,
    boolean: /(?:true|false|yes|no|on|off)\b/,
    null: /null\b|~/,
  },
  {
    plain: (r) => r.token('plain'),
    doubleQuoted: (r) => r.token('doubleQuoted'),
    singleQuoted: (r) => r.token('singleQuoted'),
    number: (r) => r.token('number'),
    boolean: (r) => r.token('boolean'),
    nil: (r) => r.token('null'),
    key: (r) =>
      r.oneOf({
        doubleQuoted: r.node('doubleQuoted'),
        singleQuoted: r.node('singleQuoted'),
        plain: r.node('plain'),
      }),
    value: (r) =>
      r.oneOf({
        mapping: r.node('mapping'),
        sequence: r.node('sequence'),
        doubleQuoted: r.node('doubleQuoted'),
        singleQuoted: r.node('singleQuoted'),
        nil: r.node('nil'),
        boolean: r.node('boolean'),
        number: r.node('number'),
        plain: r.node('plain'),
      }),
    mapEntry: (r) =>
      r.seq({ key: r.node('key'), _colon: r.token('colon'), value: r.node('value') }),
    mapping: (r) =>
      r.seq({
        _leftBrace: r.token('leftBrace'),
        entries: r.optional(r.list(r.node('mapEntry'), r.token('comma'))),
        _rightBrace: r.token('rightBrace'),
      }),
    sequence: (r) =>
      r.seq({
        _leftBracket: r.token('leftBracket'),
        items: r.optional(r.list(r.node('value'), r.token('comma'))),
        _rightBracket: r.token('rightBracket'),
      }),
    blank: (r) => r.token('newline'),
    commentLine: (r) =>
      r.seq({ text: r.token('comment'), _newline: r.optional(r.token('newline')) }),
    mappingLine: (r) =>
      r.seq({
        key: r.node('key'),
        _colon: r.token('colon'),
        value: r.node('value'),
        _comment: r.optional(r.token('comment')),
        _newline: r.optional(r.token('newline')),
      }),
    sequenceLine: (r) =>
      r.seq({
        _dash: r.token('dash'),
        value: r.node('value'),
        _comment: r.optional(r.token('comment')),
        _newline: r.optional(r.token('newline')),
      }),
    line: (r) =>
      r.oneOf({
        blank: r.node('blank'),
        comment: r.node('commentLine'),
        sequence: r.node('sequenceLine'),
        mapping: r.node('mappingLine'),
      }),
    root: (r) => r.list(r.node('line')),
  },
  { ignore: /[^\S\n]*/ },
)

const parse = createParser(yaml)

const plain = (value: string) => ({ type: 'plain' as const, value, raw: value })

describe('yaml grammar (flow collections + flat block)', () => {
  it('parses block mapping lines', () => {
    expect(parse('name: Alice\nage: 30')).toEqual({
      type: 'root',
      value: [
        {
          type: 'mappingLine',
          value: { key: plain('name'), value: plain('Alice') },
          raw: 'name: Alice\n',
        },
        {
          type: 'mappingLine',
          value: { key: plain('age'), value: { type: 'number', value: '30', raw: '30' } },
          raw: 'age: 30',
        },
      ],
      raw: 'name: Alice\nage: 30',
    })
  })

  it('parses nested flow collections as values', () => {
    expect(parse('tags: [a, b]\nmeta: {role: admin}\n')).toEqual({
      type: 'root',
      value: [
        {
          type: 'mappingLine',
          value: {
            key: plain('tags'),
            value: {
              type: 'sequence',
              value: { items: [plain('a'), plain('b')] },
              raw: '[a, b]',
            },
          },
          raw: 'tags: [a, b]\n',
        },
        {
          type: 'mappingLine',
          value: {
            key: plain('meta'),
            value: {
              type: 'mapping',
              value: {
                entries: [
                  {
                    type: 'mapEntry',
                    value: { key: plain('role'), value: plain('admin') },
                    raw: 'role: admin',
                  },
                ],
              },
              raw: '{role: admin}',
            },
          },
          raw: 'meta: {role: admin}\n',
        },
      ],
      raw: 'tags: [a, b]\nmeta: {role: admin}\n',
    })
  })

  it('parses block sequences, blank lines and comments', () => {
    expect(parse('- a\n- b\n\n# note\n')).toEqual({
      type: 'root',
      value: [
        { type: 'sequenceLine', value: { value: plain('a') }, raw: '- a\n' },
        { type: 'sequenceLine', value: { value: plain('b') }, raw: '- b\n' },
        { type: 'blank', value: '\n', raw: '\n' },
        {
          type: 'commentLine',
          value: { text: { type: 'comment', value: '# note', raw: '# note' } },
          raw: '# note\n',
        },
      ],
      raw: '- a\n- b\n\n# note\n',
    })
  })

  it('recognises booleans, null and quoted scalars', () => {
    const lines = parse('active: true\nnote: null\nlabel: "hi"\n').value
    const [active, note, label] = lines
    expect(active!.type).toBe('mappingLine')
    if (active!.type === 'mappingLine') {
      expect(active!.value.value.type).toBe('boolean')
    }
    if (note!.type === 'mappingLine') {
      expect(note!.value.value.type).toBe('nil')
    }
    if (label!.type === 'mappingLine') {
      expect(label!.value.value.type).toBe('doubleQuoted')
    }
  })

  it('keeps words that merely start with a keyword as plain scalars', () => {
    const line = parse('note: nothing').value[0]!
    if (line.type === 'mappingLine') {
      expect(line.value.value).toEqual(plain('nothing'))
    }
  })
})
