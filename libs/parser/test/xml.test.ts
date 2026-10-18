import { describe, expect, it } from 'vitest'
import { createGrammar, createParser } from '../src'

const xml = createGrammar(
  {
    leftAngleBracket: /</,
    rightAngleBracket: />/,
    leftSlashAngleBracket: /<\//,
    equal: /=/,
    string: /"(?:\\["\\/bfnrt]|\\u[0-9a-fA-F]{4}|[^"\\])*"/,
    identifier: /[a-zA-Z_][a-zA-Z0-9_-]*/,
  },
  {
    root: (r) => r.node('element'),
    element: (r) =>
      r.seq({
        _leftAngleBracket: r.token('leftAngleBracket'),
        tagName: r.token('identifier'),
        attributes: r.optional(r.list(r.node('attribute'))),
        _rightAngleBracket: r.token('rightAngleBracket'),
        children: r.optional(r.list(r.node('element'))),
        _leftSlashAngleBracket: r.token('leftSlashAngleBracket'),
        _tagName2: r.token('identifier'),
        _rightSlashAngleBracket: r.token('rightAngleBracket'),
      }),
    attribute: (r) =>
      r.seq({
        name: r.token('identifier'),
        _equal: r.token('equal'),
        value: r.token('string'),
      }),
  },
)

const parse = createParser(xml)

type XmlElement = {
  type: 'element'
  value: {
    tagName: { type: 'identifier'; value: string; raw: string }
    attributes?: { type: 'attribute'; value: { name: { type: 'identifier'; value: string; raw: string }; value: { type: 'string'; value: string; raw: string } }; raw: string }[] | undefined
    children?: XmlElement[] | undefined
  }
  raw: string
}

describe('xml grammar', () => {
  it('parses nested elements with attributes', () => {
    const element = parse('<a x="1" y="2"><b></b><c></c></a>')

    expect(element.type).toBe('element')
    expect(element.value.tagName.value).toBe('a')
    expect(element.value.attributes?.map((attribute) => attribute.value.name.value)).toEqual(['x', 'y'])
    expect(element.value.children?.map((child) => child.value.tagName.value)).toEqual(['b', 'c'])
    expect(element.raw).toBe('<a x="1" y="2"><b></b><c></c></a>')
  })

  it('infers the recursive element type', () => {
    const typed: (input: string) => XmlElement = parse
    expect(typed('<a></a>').type).toBe('element')
  })

  it('reports missing closing tags', () => {
    expect(() => parse('<a><b></b>')).toThrow()
  })

  it('rejects stray text between elements', () => {
    expect(() => parse('<a>text</a>')).toThrow()
  })
})
