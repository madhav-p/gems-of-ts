import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelDefinitionError, ModelParseError } from '../src'

import { model } from './model'

describe('enum', () => {
  it('accepts members and infers the union', () => {
    const role = model.enumType(['admin', 'user'])

    expect(role.parse('admin')).toBe('admin')
    expect(role.parse('user')).toBe('user')
    expect(() => role.parse('guest')).toThrow(ModelParseError)
    expect(role.toJSONSchema()).toEqual({ enum: ['admin', 'user'] })
    expectTypeOf(role.parse('admin')).toEqualTypeOf<'admin' | 'user'>()
  })

  it('supports mixed literal values', () => {
    const value = model.enumType(['a', 1, true, null])

    expect(value.parse(1)).toBe(1)
    expect(value.parse(true)).toBe(true)
    expect(value.parse(null)).toBeNull()
    expect(value.toJSONSchema()).toEqual({ enum: ['a', 1, true, null] })
  })

  it('is optional-able', () => {
    const role = model.enumType(['admin', 'user']).optional()

    expect(role.parse(undefined)).toBeUndefined()
    expect(role.parse('admin')).toBe('admin')
  })

  it('rejects empty and duplicate definitions', () => {
    expect(() => model.enumType([] as never)).toThrow(ModelDefinitionError)
    expect(() => model.enumType(['a', 'a'])).toThrow('duplicate value')
    expect(() => model.enumType([Infinity])).toThrow('numbers must be finite')
  })

  it('is available on the model namespace', () => {
    expect(model.enum(['a', 'b']).parse('a')).toBe('a')
  })
})
