import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelDefinitionError, ModelParseError, type NumberOptions, type StringOptions } from '../src'

import { model } from './model'

describe('string', () => {
  it('accepts any string by default', () => {
    expect(model.string().parse('hello')).toBe('hello')
    expect(model.string({}).parse('')).toBe('')
    expect(model.string().toJSONSchema()).toEqual({ type: 'string' })
  })

  it('enforces minLength and maxLength via length', () => {
    const name = model.string({ length: { min: 2, max: 4 } })

    expect(name.parse('ab')).toBe('ab')
    expect(name.parse('abcd')).toBe('abcd')
    expect(() => name.parse('a')).toThrow(ModelParseError)
    expect(() => name.parse('abcde')).toThrow(ModelParseError)
    expect(name.toJSONSchema()).toEqual({
      type: 'string',
      minLength: 2,
      maxLength: 4,
    })
  })

  it('supports exclusive length bounds', () => {
    const between = model.string({ length: { gt: 1, lt: 5 } })

    expect(between.parse('ab')).toBe('ab')
    expect(between.parse('abcd')).toBe('abcd')
    expect(() => between.parse('a')).toThrow(ModelParseError)
    expect(() => between.parse('abcde')).toThrow(ModelParseError)
    expect(between.toJSONSchema()).toEqual({
      type: 'string',
      minLength: 2,
      maxLength: 4,
    })
  })

  it('supports an exact length', () => {
    const code = model.string({ length: { eq: 3 } })

    expect(code.parse('abc')).toBe('abc')
    expect(() => code.parse('ab')).toThrow(ModelParseError)
    expect(() => code.parse('abcd')).toThrow(ModelParseError)
    expect(code.toJSONSchema()).toEqual({
      type: 'string',
      minLength: 3,
      maxLength: 3,
    })
  })

  it('combines length and pattern constraints', () => {
    const slug = model.string({
      length: { min: 3, max: 20 },
      pattern: /^[a-z0-9-]+$/,
    })

    expect(slug.parse('my-post')).toBe('my-post')
    expect(() => slug.parse('ab')).toThrow(ModelParseError)
    expect(() => slug.parse('a'.repeat(21))).toThrow(ModelParseError)
    expect(() => slug.parse('My Post')).toThrow(ModelParseError)
    expect(slug.toJSONSchema()).toEqual({
      type: 'string',
      minLength: 3,
      maxLength: 20,
      pattern: '^[a-z0-9-]+$',
    })
  })

  it('enforces an exact value', () => {
    const role = model.string({ eq: 'admin' })

    expect(role.parse('admin')).toBe('admin')
    expect(() => role.parse('user')).toThrow(ModelParseError)
    expect(role.toJSONSchema()).toEqual({ const: 'admin' })
  })

  it('infers the literal type for eq', () => {
    const role = model.string({ eq: 'admin' })
    expectTypeOf(role.parse('admin')).toEqualTypeOf<'admin'>()

    const name = model.string({ length: { min: 1 } })
    expectTypeOf(name.parse('x')).toEqualTypeOf<string>()
  })

  it('reports length issues through safeParse', () => {
    expect(model.string({ length: { min: 2 } }).safeParse('a')).toEqual({
      success: false,
      issues: [{ path: [], message: 'Expected at least 2 characters' }],
    })
    expect(model.string({ length: { max: 2 } }).safeParse('abc')).toEqual({
      success: false,
      issues: [{ path: [], message: 'Expected at most 2 characters' }],
    })
    expect(model.string({ length: { gt: 1 } }).safeParse('a')).toEqual({
      success: false,
      issues: [{ path: [], message: 'Expected more than 1 characters' }],
    })
    expect(model.string({ length: { lt: 2 } }).safeParse('abc')).toEqual({
      success: false,
      issues: [{ path: [], message: 'Expected fewer than 2 characters' }],
    })
    expect(model.string({ length: { eq: 3 } }).safeParse('ab')).toEqual({
      success: false,
      issues: [{ path: [], message: 'Expected exactly 3 characters' }],
    })
  })

  it('enforces startsWith, endsWith, and includes', () => {
    const name = model.string({ startsWith: 'a', endsWith: 'z', includes: 'mid' })

    expect(name.parse('amidz')).toBe('amidz')
    expect(() => name.parse('xmidz')).toThrow(ModelParseError)
    expect(() => name.parse('amidx')).toThrow(ModelParseError)
    expect(() => name.parse('az')).toThrow(ModelParseError)

    expect(model.string({ startsWith: 'a' }).toJSONSchema()).toEqual({
      type: 'string',
      pattern: '^a',
    })
    expect(model.string({ endsWith: 'z' }).toJSONSchema()).toEqual({
      type: 'string',
      pattern: 'z$',
    })
    expect(model.string({ includes: 'mid' }).toJSONSchema()).toEqual({
      type: 'string',
      pattern: '^(?=[\\s\\S]*mid)',
    })
    expect(name.toJSONSchema()).toEqual({
      type: 'string',
      pattern: '^(?=[\\s\\S]*mid)a[\\s\\S]*z$',
    })
  })

  it('reports text-match issues through safeParse', () => {
    expect(model.string({ startsWith: 'a' }).safeParse('x')).toEqual({
      success: false,
      issues: [{ path: [], message: 'Expected to start with "a"' }],
    })
    expect(model.string({ endsWith: 'z' }).safeParse('x')).toEqual({
      success: false,
      issues: [{ path: [], message: 'Expected to end with "z"' }],
    })
    expect(model.string({ includes: 'mid' }).safeParse('x')).toEqual({
      success: false,
      issues: [{ path: [], message: 'Expected to include "mid"' }],
    })
  })

  it('reports pattern issues through safeParse', () => {
    expect(model.string({ pattern: /^[a-z]+$/ }).safeParse('ABC')).toEqual({
      success: false,
      issues: [{ path: [], message: 'Expected to match ^[a-z]+$' }],
    })
    expect(model.string().safeParse('ok')).toEqual({ success: true, data: 'ok' })
  })

  it('rejects non-strings', () => {
    expect(() => model.string().parse(42)).toThrow(ModelParseError)
    expect(() => model.string().parse(null)).toThrow(ModelParseError)
    expect(() => model.string().parse(undefined)).toThrow(ModelParseError)
  })

  it('keeps global patterns stateless', () => {
    const word = model.string({ pattern: /^a/g })
    expect(word.parse('abc')).toBe('abc')
    expect(word.parse('abc')).toBe('abc')
  })
})

describe('string definition errors (states TypeScript cannot express)', () => {
  it('rejects an inverted length range', () => {
    expect(() => model.string({ length: { min: 5, max: 1 } })).toThrow(
      ModelDefinitionError,
    )
    expect(() => model.string({ length: { min: 5, max: 1 } })).toThrow(
      '"length" range is empty',
    )
  })

  it('rejects an empty integer length range', () => {
    expect(() => model.string({ length: { gt: 0, lt: 1 } })).toThrow(
      '"length" range is empty',
    )
  })

  it('rejects lengths with no non-negative values', () => {
    expect(() => model.string({ length: { lt: 0 } })).toThrow(
      '"length" has no non-negative values',
    )
  })

  it('rejects invalid lengths', () => {
    expect(() => model.string({ length: { min: -1 } })).toThrow(
      '"length.min" must be a non-negative integer',
    )
    expect(() => model.string({ length: { max: 1.5 } })).toThrow(
      '"length.max" must be a non-negative integer',
    )
    expect(() => model.string({ length: { eq: 1.5 } })).toThrow(
      '"length.eq" must be a non-negative integer',
    )
    expect(() => model.string({ length: { gt: Infinity } })).toThrow(
      '"length.gt" must be a non-negative integer',
    )
  })

  it('rejects a non-RegExp pattern', () => {
    expect(() => model.string({ pattern: 'a' as unknown as RegExp })).toThrow(
      '"pattern" must be a RegExp',
    )
  })

  it('rejects pattern combined with text matches', () => {
    expect(() =>
      model.string({
        pattern: /a/,
        startsWith: 'a',
      } as unknown as StringOptions),
    ).toThrow(
      '"pattern" cannot be combined with startsWith, endsWith, or includes',
    )
  })

  it('rejects eq combined with other constraints that bypassed types', () => {
    expect(() =>
      model.string({ eq: 'a', length: { min: 1 } } as unknown as StringOptions),
    ).toThrow('"eq" cannot be combined with other constraints')
    expect(() =>
      model.string({ eq: 'a', pattern: /a/ } as unknown as StringOptions),
    ).toThrow('"eq" cannot be combined with other constraints')
  })

  it('rejects invalid nested length options that bypassed types', () => {
    expect(() =>
      model.string({ length: { eq: 1, min: 0 } as unknown as NumberOptions }),
    ).toThrow('"eq" cannot be combined with bounds')
    expect(() =>
      model.string({ length: { min: 0, gt: 1 } as unknown as NumberOptions }),
    ).toThrow('use either "min" or "gt", not both')
  })
})

describe('string option types', () => {
  it('accepts every valid shape', () => {
    model.string()
    model.string({})
    model.string({ length: {} })
    model.string({ length: { min: 1 } })
    model.string({ length: { max: 10 } })
    model.string({ length: { min: 1, max: 10 } })
    model.string({ length: { gt: 0 } })
    model.string({ length: { lt: 10 } })
    model.string({ length: { gt: 0, lt: 10 } })
    model.string({ length: { eq: 3 } })
    model.string({ length: { min: 1, max: 10 }, pattern: /^[a-z]+$/ })
    model.string({ pattern: /^[a-z]+$/ })
    model.string({ startsWith: 'a' })
    model.string({ endsWith: 'z' })
    model.string({ includes: 'mid' })
    model.string({ startsWith: 'a', endsWith: 'z', includes: 'mid' })
    model.string({ length: { min: 1 }, startsWith: 'a' })
    model.string({ eq: 'admin' })
  })

  it('rejects eq combined with a constraint', () => {
    const invalid = () => {
      // @ts-expect-error eq and length are mutually exclusive
      model.string({ eq: 'a', length: { min: 1 } })
      // @ts-expect-error eq and pattern are mutually exclusive
      model.string({ eq: 'a', pattern: /a/ })
      // @ts-expect-error eq and startsWith are mutually exclusive
      model.string({ eq: 'a', startsWith: 'a' })
      // @ts-expect-error eq and endsWith are mutually exclusive
      model.string({ eq: 'a', endsWith: 'a' })
      // @ts-expect-error eq and includes are mutually exclusive
      model.string({ eq: 'a', includes: 'a' })
    }
    expect(invalid).toBeTypeOf('function')
  })

  it('makes pattern mutually exclusive with text matches', () => {
    const invalid = () => {
      // @ts-expect-error pattern and startsWith are mutually exclusive
      model.string({ pattern: /a/, startsWith: 'a' })
      // @ts-expect-error pattern and endsWith are mutually exclusive
      model.string({ pattern: /a/, endsWith: 'a' })
      // @ts-expect-error pattern and includes are mutually exclusive
      model.string({ pattern: /a/, includes: 'a' })
    }
    expect(invalid).toBeTypeOf('function')
  })

  it('reuses the number option exclusions inside length', () => {
    const invalid = () => {
      // @ts-expect-error length.eq and length.min are mutually exclusive
      model.string({ length: { eq: 1, min: 0 } })
      // @ts-expect-error length.min and length.gt are both lower bounds
      model.string({ length: { min: 0, gt: 1 } })
      // @ts-expect-error length.max and length.lt are both upper bounds
      model.string({ length: { max: 10, lt: 5 } })
    }
    expect(invalid).toBeTypeOf('function')
  })
})
