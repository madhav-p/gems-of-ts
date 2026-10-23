import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelParseError } from '../src'

import { model } from './model'

describe('boolean', () => {
  it('accepts true and false', () => {
    const active = model.boolean()

    expect(active.parse(true)).toBe(true)
    expect(active.parse(false)).toBe(false)
    expectTypeOf(active.parse(true)).toEqualTypeOf<boolean>()
  })

  it('rejects non-booleans', () => {
    expect(() => model.boolean().parse(1)).toThrow(ModelParseError)
    expect(() => model.boolean().parse(0)).toThrow(ModelParseError)
    expect(() => model.boolean().parse('true')).toThrow(ModelParseError)
    expect(() => model.boolean().parse(null)).toThrow(ModelParseError)
    expect(() => model.boolean().parse(undefined)).toThrow(ModelParseError)
  })

  it('reports issues through safeParse', () => {
    expect(model.boolean().safeParse('true')).toEqual({
      success: false,
      issues: [{ path: [], message: 'Expected boolean, received string' }],
    })
    expect(model.boolean().safeParse(false)).toEqual({ success: true, data: false })
  })

  it('emits JSON Schema', () => {
    expect(model.boolean().toJSONSchema()).toEqual({ type: 'boolean' })
  })

  it('is available on the model namespace', () => {
    expect(model.boolean().parse(true)).toBe(true)
  })
})
