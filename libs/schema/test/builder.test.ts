import { describe, expect, it } from 'vitest'
import { createSchemaBuilder, SchemaParseError } from '../src'

describe('createSchemaBuilder', () => {
  it('exposes the built-in formats out of the box', () => {
    const t = createSchemaBuilder()
    expect(t.string((sv) => sv.format('email')).parse('a@b.com')).toBe('a@b.com')
    expect(t.number((nv) => nv.format('int')).toJSONSchema()).toEqual({ type: 'integer' })
  })

  it('adds a custom string format supplied at creation', () => {
    const t = createSchemaBuilder({
      stringFormats: {
        hex: {
          validate: (value) =>
            /^#?[0-9a-fA-F]{6}$/.test(value) ? undefined : 'Expected a hex colour',
          jsonFormat: 'color',
        },
      },
    })

    const colour = t.string((sv) => sv.format('hex'))
    expect(colour.parse('#ff0000')).toBe('#ff0000')
    expect(() => colour.parse('red')).toThrow(SchemaParseError)
    expect(colour.toJSONSchema()).toEqual({ type: 'string', format: 'color' })
  })

  it('overrides a built-in format per builder', () => {
    const strict = createSchemaBuilder({
      stringFormats: {
        email: {
          validate: (value) =>
            value.endsWith('@corp.com') ? undefined : 'Expected a @corp.com address',
        },
      },
    })
    const corp = strict.string((sv) => sv.format('email'))
    expect(corp.parse('a@corp.com')).toBe('a@corp.com')
    expect(() => corp.parse('a@example.com')).toThrow(SchemaParseError)

    const plain = createSchemaBuilder()
    expect(plain.string((sv) => sv.format('email')).parse('a@example.com')).toBe('a@example.com')
  })

  it('does not leak formats between builders', () => {
    const withHex = createSchemaBuilder({
      stringFormats: { hex: { validate: () => undefined } },
    })
    const plain = createSchemaBuilder()

    expect(() => withHex.string((sv) => sv.format('hex'))).not.toThrow()
    expect(() => plain.string((sv) => sv.format('hex'))).toThrow(/Unknown string format/)
  })

  it('supports custom number formats', () => {
    const builder = createSchemaBuilder({
      numberFormats: {
        even: { validate: (value) => (value % 2 === 0 ? undefined : 'Expected an even number') },
      },
    })

    const even = builder.number((nv) => nv.format('even').min(0))
    expect(even.parse(4)).toBe(4)
    expect(() => even.parse(3)).toThrow(SchemaParseError)
    expect(() => even.parse(-2)).toThrow(SchemaParseError)
    expect(even.toJSONSchema()).toEqual({ type: 'number', minimum: 0 })
  })
})
