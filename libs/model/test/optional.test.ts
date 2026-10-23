import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelParseError } from '../src'

import { model } from './model'

describe('optional modifier', () => {
  it('short-circuits undefined and keeps the base rules', () => {
    const name = model.string({ length: { min: 1 } }).optional()

    expect(name.isOptional).toBe(true)
    expect(name.parse(undefined)).toBeUndefined()
    expect(name.parse('Ada')).toBe('Ada')
    expect(() => name.parse('')).toThrow(ModelParseError)
    expect(name.safeParse(undefined)).toEqual({ success: true, data: undefined })
    expect(name.toJSONSchema()).toEqual({ type: 'string', minLength: 1 })
    expectTypeOf(name.parse(undefined)).toEqualTypeOf<string | undefined>()
  })

  it('works on every type', () => {
    expect(model.number().optional().parse(undefined)).toBeUndefined()
    expect(model.boolean().optional().parse(undefined)).toBeUndefined()
    expect(model.nullType().optional().parse(undefined)).toBeUndefined()
    expect(model.nullType().optional().parse(null)).toBeNull()
    expect(model.list(model.string()).optional().parse(undefined)).toBeUndefined()
    expect(
      model.object({ name: model.string() }).optional().parse(undefined),
    ).toBeUndefined()
  })

  it('is idempotent', () => {
    const maybe = model.string().optional().optional()

    expect(maybe.parse(undefined)).toBeUndefined()
    expect(maybe.parse('x')).toBe('x')
  })
})
