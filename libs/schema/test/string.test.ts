import { describe, expect, expectTypeOf, it } from 'vitest'
import { createSchemaBuilder, SchemaParseError } from '../src'

const t = createSchemaBuilder()
const { string } = t

describe('string rules', () => {
  it('validates a length range', () => {
    const name = string((sv) => sv.length((nv) => nv.min(2).max(4)))
    expect(name.parse('abc')).toBe('abc')
    expect(() => name.parse('a')).toThrow(SchemaParseError)
    expect(() => name.parse('abcde')).toThrow(SchemaParseError)
    expect(name.toJSONSchema()).toEqual({ type: 'string', minLength: 2, maxLength: 4 })
  })

  it('validates an exact length', () => {
    const code = string((sv) => sv.length(3))
    expect(code.parse('abc')).toBe('abc')
    expect(() => code.parse('ab')).toThrow(SchemaParseError)
    expect(code.toJSONSchema()).toEqual({ type: 'string', minLength: 3, maxLength: 3 })
  })

  it('validates a pattern via matches', () => {
    const lower = string((sv) => sv.matches(/^[a-z]+$/))
    expect(lower.parse('abc')).toBe('abc')
    expect(() => lower.parse('ABC')).toThrow(SchemaParseError)
    expect(lower.toJSONSchema()).toEqual({ type: 'string', pattern: '^[a-z]+$' })
  })

  it('rejects non-strings', () => {
    expect(() => string().parse(42)).toThrow(SchemaParseError)
  })
})

describe('string formats', () => {
  const email = string((sv) => sv.format('email'))

  it('brands the parsed value', () => {
    expectTypeOf(email.parse('a@b.com')).toMatchTypeOf<string & { readonly __format: 'email' }>()
  })

  it('validates the whole value', () => {
    expect(email.parse('a@b.com')).toBe('a@b.com')
    expect(() => email.parse('nope')).toThrow(SchemaParseError)
    expect(email.toJSONSchema()).toEqual({ type: 'string', format: 'email' })
  })

  it('refines a named part (email domain)', () => {
    const corporate = string((sv) =>
      sv.format('email', { domain: (domain) => domain.matches(/^example\.com$/) }),
    )
    expect(corporate.parse('a@example.com')).toBe('a@example.com')
    expect(() => corporate.parse('a@other.com')).toThrow(SchemaParseError)
  })

  it('refines a named part (url host)', () => {
    const linkedin = string((sv) =>
      sv.format('url', { host: (host) => host.matches(/^(www\.)?linkedin\.com$/) }),
    )
    expect(linkedin.parse('https://www.linkedin.com/in/x')).toBe('https://www.linkedin.com/in/x')
    expect(() => linkedin.parse('https://example.com')).toThrow(SchemaParseError)
    expect(() => linkedin.parse('not a url')).toThrow(SchemaParseError)
  })

  it('combines length, and format', () => {
    const website = string((sv) => sv.length((nv) => nv.max(100)).format('url'))
    expect(website.parse('https://example.com')).toBe('https://example.com')
    expect(() => website.parse('x'.repeat(101))).toThrow(SchemaParseError)
    expect(website.toJSONSchema()).toEqual({ type: 'string', maxLength: 100, format: 'uri' })
  })

  it('throws at definition time for an unknown format', () => {
    expect(() => string((sv) => sv.format('does-not-exist'))).toThrow(/Unknown string format/)
  })

  it('throws at definition time for an unknown format option', () => {
    expect(() => string((sv) => sv.format('email', { nope: (s) => s }))).toThrow(
      /has no option "nope"/,
    )
  })
})
