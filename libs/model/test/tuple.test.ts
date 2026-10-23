import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelParseError, mutate } from '../src'

import { model } from './model'

describe('tuple', () => {
  it('parses fixed-length tuples', () => {
    const point = model.tuple([model.number(), model.number()])

    expect(point.parse([1, 2])).toEqual([1, 2])
    expect(() => point.parse([1])).toThrow(ModelParseError)
    expect(() => point.parse([1, 2, 3])).toThrow(ModelParseError)
    expect(() => point.parse('x')).toThrow(ModelParseError)
    const value = point.parse([1, 2])
    expectTypeOf(value[0]).toEqualTypeOf<number>()
    expectTypeOf(value[1]).toEqualTypeOf<number>()
  })

  it('validates elements by index', () => {
    const pair = model.tuple([model.string({ length: { min: 1 } }), model.number({ min: 0 })])
    const result = pair.safeParse(['', -1])

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toEqual([
        { path: [0], message: 'Expected at least 1 characters' },
        { path: [1], message: 'Expected a value of at least 0' },
      ])
    }
  })

  it('emits JSON Schema', () => {
    expect(model.tuple([model.string(), model.number()]).toJSONSchema()).toEqual({
      type: 'array',
      prefixItems: [{ type: 'string' }, { type: 'number' }],
      items: false,
      minItems: 2,
      maxItems: 2,
    })
  })

  it('is readonly, frozen, optional, and nullable', () => {
    const value = model.tuple([model.number()]).parse([1])
    expect(Object.isFrozen(value)).toBe(true)

    expect(model.tuple([model.number()]).optional().parse(undefined)).toBeUndefined()
    expect(model.tuple([model.number()]).nullable().parse(null)).toBeNull()
  })

  it('supports mutate with structural sharing', () => {
    const Item = model.object({ name: model.string() })
    const pair = model.tuple([Item, model.number()])
    const value = pair.parse([{ name: 'a' }, 1])

    const next = mutate(value, (draft) => {
      draft[1] = 2
    })

    expect(next[0]).toBe(value[0])
    expect(next[1]).toBe(2)
  })

  it('rejects optional items at the type level', () => {
    const invalid = () => {
      // @ts-expect-error tuple items cannot be optional
      model.tuple([model.string().optional()])
    }
    expect(invalid).toBeTypeOf('function')
  })

  it('is available on the model namespace', () => {
    expect(model.tuple([model.number()]).parse([1])).toEqual([1])
  })
})
