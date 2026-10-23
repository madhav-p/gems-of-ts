import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelParseError, mutate } from '../src'

import { model } from './model'

describe('record', () => {
  it('validates values by key', () => {
    const scores = model.record(model.number({ min: 0 }))

    expect(scores.parse({ ada: 10, grace: 20 })).toEqual({ ada: 10, grace: 20 })
    expectTypeOf(scores.parse({})).toMatchTypeOf<Readonly<Record<string, number>>>()

    expect(() => scores.parse({ ada: -1 })).toThrow(ModelParseError)

    const result = scores.safeParse({ ada: 10, grace: 'x' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toEqual([
        { path: ['grace'], message: 'Expected number, received string' },
      ])
    }
  })

  it('rejects non-objects', () => {
    expect(() => model.record(model.string()).parse(null)).toThrow(ModelParseError)
    expect(() => model.record(model.string()).parse([])).toThrow(ModelParseError)
    expect(() => model.record(model.string()).parse('x')).toThrow(ModelParseError)
  })

  it('emits JSON Schema', () => {
    expect(model.record(model.string({ pattern: /^[a-z]+$/ })).toJSONSchema()).toEqual({
      type: 'object',
      additionalProperties: { type: 'string', pattern: '^[a-z]+$' },
    })
  })

  it('is readonly, frozen, and optional-able', () => {
    const scores = model.record(model.number()).parse({ a: 1 })
    expect(Object.isFrozen(scores)).toBe(true)

    const maybe = model.record(model.number()).optional()
    expect(maybe.parse(undefined)).toBeUndefined()
    expect(maybe.parse({ a: 1 })).toEqual({ a: 1 })
  })

  it('rejects optional values at the type level', () => {
    const invalid = () => {
      // @ts-expect-error record values cannot be optional
      model.record(model.string().optional())
    }
    expect(invalid).toBeTypeOf('function')
  })

  it('supports mutate with structural sharing', () => {
    const scores = model.record(model.number()).parse({ a: 1, b: 2 })
    const next = mutate(scores, (draft) => {
      draft.a = 3
    })

    expect(next.a).toBe(3)
    expect(next.b).toBe(2)
    expect(next).not.toBe(scores)
  })

  it('shares unchanged object values during mutation', () => {
    const Item = model.object({ name: model.string() })
    const items = model.record(Item).parse({ a: { name: 'a' }, b: { name: 'b' } })

    const next = mutate(items, (draft) => {
      draft.b!.name = 'B'
    })

    expect(next.a).toBe(items.a)
    expect(next.b).not.toBe(items.b)
    expect(next.b!.name).toBe('B')
  })

  it('adds and removes record keys during mutation', () => {
    const scores = model.record(model.number()).parse({ a: 1 })
    const next = mutate(scores, (draft) => {
      delete draft.a
      draft.b = 2
    })

    expect(next).toEqual({ b: 2 })
  })

  it('is available on the model namespace', () => {
    expect(model.record(model.number()).parse({ a: 1 })).toEqual({ a: 1 })
  })
})
