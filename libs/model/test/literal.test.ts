import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelDefinitionError, ModelParseError } from '../src'

import { model } from './model'

describe('literal', () => {
  it('accepts exactly the literal value', () => {
    const role = model.literal('admin')

    expect(role.parse('admin')).toBe('admin')
    expect(() => role.parse('user')).toThrow(ModelParseError)
    expect(role.toJSONSchema()).toEqual({ const: 'admin' })
    expectTypeOf(role.parse('admin')).toEqualTypeOf<'admin'>()
  })

  it('supports number, boolean, and null literals', () => {
    expect(model.literal(42).parse(42)).toBe(42)
    expect(model.literal(true).parse(true)).toBe(true)
    expect(model.literal(null).parse(null)).toBeNull()

    expectTypeOf(model.literal(42).parse(42)).toEqualTypeOf<42>()
    expectTypeOf(model.literal(true).parse(true)).toEqualTypeOf<true>()
    expectTypeOf(model.literal(null).parse(null)).toEqualTypeOf<null>()
  })

  it('rejects other values', () => {
    expect(() => model.literal(42).parse(43)).toThrow(ModelParseError)
    expect(() => model.literal(true).parse(false)).toThrow(ModelParseError)
    expect(() => model.literal(null).parse(undefined)).toThrow(ModelParseError)
    expect(() => model.literal('x').parse('x ')).toThrow(ModelParseError)
  })

  it('is optional-able', () => {
    const role = model.literal('admin').optional()

    expect(role.parse(undefined)).toBeUndefined()
    expect(role.parse('admin')).toBe('admin')
  })

  it('rejects non-finite numbers at definition', () => {
    expect(() => model.literal(Infinity)).toThrow(ModelDefinitionError)
    expect(() => model.literal(NaN)).toThrow(ModelDefinitionError)
  })

  it('is available on the model namespace', () => {
    expect(model.literal('admin').parse('admin')).toBe('admin')
  })
})
