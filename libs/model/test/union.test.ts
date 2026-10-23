import { describe, expect, expectTypeOf, it } from 'vitest'
import { ModelDefinitionError, ModelParseError, mutate } from '../src'

import { model } from './model'

const Circle = model.object({ radius: model.number({ min: 0 }) })
const Square = model.object({ side: model.number({ min: 0 }) })
const Shape = model.union({ circle: Circle, square: Square })

describe('union', () => {
  it('wraps variants under the discriminant and data keys', () => {
    const circle = Shape.parse({ __type: 'circle', data: { radius: 2 } })

    expect(circle.__type).toBe('circle')
    expect(circle.data).toBeInstanceOf(Circle)
    expect(circle).toBeInstanceOf(Shape)
    expectTypeOf(circle.__type).toEqualTypeOf<'circle' | 'square'>()

    if (circle.__type === 'circle') {
      expect(circle.data.radius).toBe(2)
      expectTypeOf(circle.data.radius).toEqualTypeOf<number>()
    }
  })

  it('rejects unknown or missing discriminants', () => {
    expect(() => Shape.parse({ __type: 'triangle', data: {} })).toThrow(
      ModelParseError,
    )
    expect(() => Shape.parse({ data: { radius: 2 } })).toThrow(ModelParseError)
  })

  it('validates the variant data', () => {
    expect(() => Shape.parse({ __type: 'circle', data: { radius: -1 } })).toThrow(
      ModelParseError,
    )
    expect(() => Shape.parse({ __type: 'circle' })).toThrow(ModelParseError)
  })

  it('emits JSON Schema oneOf wrappers', () => {
    expect(Shape.toJSONSchema()).toEqual({
      oneOf: [
        {
          type: 'object',
          properties: {
            __type: { const: 'circle' },
            data: {
              type: 'object',
              properties: { radius: { type: 'number', minimum: 0 } },
              required: ['radius'],
              additionalProperties: false,
            },
          },
          required: ['__type', 'data'],
          additionalProperties: false,
        },
        {
          type: 'object',
          properties: {
            __type: { const: 'square' },
            data: {
              type: 'object',
              properties: { side: { type: 'number', minimum: 0 } },
              required: ['side'],
              additionalProperties: false,
            },
          },
          required: ['__type', 'data'],
          additionalProperties: false,
        },
      ],
    })
  })

  it('is optional and nullable', () => {
    expect(Shape.optional().parse(undefined)).toBeUndefined()
    expect(Shape.nullable().parse(null)).toBeNull()
  })

  it('supports mutate inside variant data', () => {
    const circle = Shape.parse({ __type: 'circle', data: { radius: 2 } })
    if (circle.__type !== 'circle') {
      throw new Error('expected a circle')
    }

    const next = mutate(circle, (draft) => {
      draft.data.radius = 3
    })

    expect(next.data.radius).toBe(3)
    expect(next.__type).toBe('circle')
    expect(next).toBeInstanceOf(Shape)
  })

  it('defaults the discriminant to __type', () => {
    expect(Shape.discriminant).toBe('__type')
  })

  it('requires an explicit key when a variant has __type', () => {
    const Meta = model.object({ __type: model.literal('meta'), value: model.number() })

    expect(() => model.union({ meta: Meta } as never)).toThrow(ModelDefinitionError)

    const invalid = () => {
      // @ts-expect-error __type is present in a variant; key must be explicit
      model.union({ meta: Meta })
    }
    expect(invalid).toBeTypeOf('function')

    const Tagged = model.union({ meta: Meta }, 'kind')
    expect(
      Tagged.parse({
        kind: 'meta',
        data: { __type: 'meta', value: 1 },
      }),
    ).toEqual({
      kind: 'meta',
      data: { __type: 'meta', value: 1 },
    })
  })

  it('supports an explicit key without __type', () => {
    const Tagged = model.union({ circle: Circle }, 'kind')

    expect(Tagged.discriminant).toBe('kind')
    expect(Tagged.parse({ kind: 'circle', data: { radius: 1 } })).toEqual({
      kind: 'circle',
      data: { radius: 1 },
    })
  })

  it('rejects an empty union at definition', () => {
    expect(() => model.union({} as never)).toThrow(ModelDefinitionError)
  })

  it('is available on the model namespace', () => {
    const Kind = model.union({ a: model.object({ value: model.number() }) })
    expect(Kind.parse({ __type: 'a', data: { value: 1 } })).toEqual({
      __type: 'a',
      data: { value: 1 },
    })
  })
})
