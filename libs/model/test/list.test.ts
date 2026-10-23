import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelDefinitionError, ModelParseError, mutate, type NumberOptions } from '../src'

import { model } from './model'

describe('list', () => {
  it('parses an array of the element schema', () => {
    const tags = model.list(model.string({ length: { min: 1 } }))

    expect(tags.parse(['a', 'b'])).toEqual(['a', 'b'])
    expect(tags.parse([])).toEqual([])
    expectTypeOf(tags.parse([])).toMatchTypeOf<readonly string[]>()
  })

  it('reports element paths', () => {
    const scores = model.list(model.number({ min: 0, max: 10 }))
    const result = scores.safeParse([1, 11, -1])

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toEqual([
        { path: [1], message: 'Expected a value of at most 10' },
        { path: [2], message: 'Expected a value of at least 0' },
      ])
    }
  })

  it('rejects non-arrays, bad elements, and holes', () => {
    expect(() => model.list(model.string()).parse('x')).toThrow(ModelParseError)
    expect(() => model.list(model.string()).parse([1])).toThrow(ModelParseError)
    expect(() => model.list(model.string()).parse(Array(1))).toThrow(ModelParseError)
  })

  it('emits JSON Schema', () => {
    expect(model.list(model.string({ pattern: /^[a-z]+$/ })).toJSONSchema()).toEqual({
      type: 'array',
      items: { type: 'string', pattern: '^[a-z]+$' },
    })
  })

  it('enforces list length', () => {
    const bounded = model.list(model.string(), { length: { min: 1, max: 2 } })

    expect(bounded.parse(['a'])).toBeInstanceOf(Array)
    expect(bounded.parse(['a', 'b'])).toEqual(['a', 'b'])
    expect(() => bounded.parse([])).toThrow(ModelParseError)
    expect(() => bounded.parse(['a', 'b', 'c'])).toThrow(ModelParseError)
    expect(bounded.toJSONSchema()).toEqual({
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 2,
    })
  })

  it('supports exclusive and exact list lengths', () => {
    const between = model.list(model.string(), { length: { gt: 0, lt: 3 } })
    expect(between.toJSONSchema()).toEqual({
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      maxItems: 2,
    })

    const pair = model.list(model.number(), { length: { eq: 2 } })
    expect(pair.parse([1, 2])).toEqual([1, 2])
    expect(() => pair.parse([1])).toThrow(ModelParseError)
    expect(pair.toJSONSchema()).toEqual({
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2,
    })
  })

  it('validates length during mutation', () => {
    const bounded = model.list(model.string(), { length: { min: 1, max: 2 } })
    const values = bounded.parse(['a'])

    expect(mutate(values, (draft) => { draft.push('b') })).toEqual(['a', 'b'])
    expect(() => mutate(values, (draft) => { draft.push('b', 'c') })).toThrow(
      ModelParseError,
    )
    expect(() => mutate(values, (draft) => { draft.pop() })).toThrow(ModelParseError)
    expect(() => mutate(values, (draft) => { draft.shift() })).toThrow(ModelParseError)
    expect(() => mutate(values, (draft) => { draft.splice(0, 1) })).toThrow(
      ModelParseError,
    )
    expect(() => mutate(values, (draft) => { draft.unshift() })).not.toThrow()
    expect(() => mutate(values, (draft) => { draft.length = 0 })).toThrow(
      ModelParseError,
    )
  })

  it('shares unchanged elements when list length changes validly', () => {
    const Item = model.object({ name: model.string() })
    const items = model.list(Item, { length: { min: 1, max: 2 } }).parse([
      { name: 'a' },
    ])
    const next = mutate(items, (draft) => {
      draft.push({ name: 'b' })
    })

    expect(next[0]).toBe(items[0])
    expect(next[1]).toEqual({ name: 'b' })
  })

  it('nests', () => {
    const matrix = model.list(model.list(model.number({ int: true })))

    expect(matrix.parse([[1, 2], [3]])).toEqual([[1, 2], [3]])
    expectTypeOf(matrix.parse([])).toMatchTypeOf<ReadonlyArray<readonly number[]>>()
  })

  it('is optional-able', () => {
    const maybe = model.list(model.string()).optional()

    expect(maybe.parse(undefined)).toBeUndefined()
    expect(maybe.parse(['a'])).toEqual(['a'])
  })

  it('rejects optional elements at the type level', () => {
    const invalid = () => {
      // @ts-expect-error list elements cannot be optional
      model.list(model.string().optional())
    }
    expect(invalid).toBeTypeOf('function')
  })

  it('exposes the options it was built from', () => {
    const schema = model.list(model.string(), { length: { max: 2 } })

    expect(schema.parse(['a'])).toEqual(['a'])
    expect(schema.options).toEqual({ length: { max: 2 } })
  })

  it('rejects invalid length definitions', () => {
    expect(() =>
      model.list(model.string(), { length: { min: 3, max: 1 } }),
    ).toThrow(ModelDefinitionError)
    expect(() =>
      model.list(model.string(), { length: { min: 3, max: 1 } }),
    ).toThrow('"length" range is empty')
    expect(() =>
      model.list(model.string(), { length: { min: -1 } }),
    ).toThrow('"length.min" must be a non-negative integer')
    expect(() =>
      model.list(model.string(), {
        length: { eq: 1, min: 0 } as unknown as NumberOptions,
      }),
    ).toThrow('"eq" cannot be combined with bounds')
  })

  it('reuses number option exclusions for length', () => {
    const invalid = () => {
      // @ts-expect-error length.eq and length.min are mutually exclusive
      model.list(model.string(), { length: { eq: 1, min: 0 } })
      // @ts-expect-error length.min and length.gt are both lower bounds
      model.list(model.string(), { length: { min: 0, gt: 1 } })
      // @ts-expect-error length.max and length.lt are both upper bounds
      model.list(model.string(), { length: { max: 10, lt: 5 } })
    }
    expect(invalid).toBeTypeOf('function')
  })

  it('is available on the model namespace', () => {
    expect(model.list(model.number()).parse([1, 2])).toEqual([1, 2])
  })
})
