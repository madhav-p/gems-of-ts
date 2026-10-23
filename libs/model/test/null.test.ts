import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelParseError } from '../src'

import { model } from './model'

describe('null', () => {
  it('accepts only null', () => {
    const nothing = model.nullType()

    expect(nothing.parse(null)).toBeNull()
    expectTypeOf(nothing.parse(null)).toEqualTypeOf<null>()
  })

  it('rejects everything else', () => {
    for (const value of [undefined, 0, '', false, NaN, {}, []]) {
      expect(() => model.nullType().parse(value)).toThrow(ModelParseError)
    }
  })

  it('reports issues through safeParse', () => {
    expect(model.nullType().safeParse(undefined)).toEqual({
      success: false,
      issues: [{ path: [], message: 'Expected null, received undefined' }],
    })
    expect(model.nullType().safeParse(null)).toEqual({ success: true, data: null })
  })

  it('emits JSON Schema', () => {
    expect(model.nullType().toJSONSchema()).toEqual({ type: 'null' })
  })

  it('is available on the model namespace', () => {
    expect(model.null().parse(null)).toBeNull()
  })
})
