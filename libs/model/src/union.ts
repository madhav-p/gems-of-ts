import {
  ModelDefinitionError,
  ModelParseError,
  typeName,
  type ParseResult,
} from './errors'
import type { OneOfJsonSchema } from './json-schema'
import type { ObjectSchema, ObjectShape } from './object'
import {
  deepFreeze,
  makeDefault,
  makeNullable,
  makeOptional,
  MODEL,
  Model,
  type Constructable,
  type DeepReadonly,
  type DefaultSchema,
  type InferSchema,
  type ModelBrand,
  type NullableSchema,
  type OptionalSchema,
  type RequiredSchemaClass,
} from './schema'

export type UnionVariant = ObjectSchema<ObjectShape>

const DEFAULT_DISCRIMINANT = '__type'
const DATA_KEY = 'data'

type HasDefaultField<V extends Record<string, UnionVariant>> = true extends {
  [K in keyof V]: typeof DEFAULT_DISCRIMINANT extends keyof V[K]['fields']
    ? true
    : false
}[keyof V]
  ? true
  : false

export type UnionOutput<
  V extends Record<string, UnionVariant>,
  D extends string,
> = {
  [K in keyof V]: {
    readonly [P in D]: K
  } & {
    readonly data: InferSchema<V[K]>
  } & {
    readonly [MODEL]: K
  }
}[keyof V]

export type DiscriminatedUnionSchema<
  D extends string,
  V extends Record<string, UnionVariant>,
> = {
  new (value: unknown): UnionOutput<V, D>
  parse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): DeepReadonly<InstanceType<This>> & ModelBrand
    (value: unknown): UnionOutput<V, D>
  }
  safeParse: {
    <This extends Constructable>(
      this: This,
      value: unknown,
    ): ParseResult<DeepReadonly<InstanceType<This>> & ModelBrand>
    (value: unknown): ParseResult<UnionOutput<V, D>>
  }
  toJSONSchema(): OneOfJsonSchema
  readonly isOptional: false
  readonly discriminant: D
  readonly variants: V
  readonly dataKey: typeof DATA_KEY
  optional(): OptionalSchema<UnionOutput<V, D>, OneOfJsonSchema>
  nullable(): NullableSchema<UnionOutput<V, D>, OneOfJsonSchema>
  default(value: UnionOutput<V, D>): DefaultSchema<UnionOutput<V, D>, OneOfJsonSchema>
}

function hasField(
  variants: Record<string, UnionVariant>,
  key: string,
): boolean {
  return Object.keys(variants).some(
    (name) => key in variants[name]!.fields,
  )
}

function assertVariants(variants: Record<string, UnionVariant>): void {
  const keys = Object.keys(variants)
  if (keys.length === 0) {
    throw new ModelDefinitionError(
      'Invalid union model: at least one variant is required',
    )
  }
  for (const key of keys) {
    const variant = variants[key]
    if (!variant || variant.fields === undefined) {
      throw new ModelDefinitionError(
        `Invalid union model: variant "${key}" must be an object schema`,
      )
    }
  }
}

function parseUnion<
  V extends Record<string, UnionVariant>,
  D extends string,
>(
  discriminant: D,
  variants: V,
  keys: string[],
  value: unknown,
): UnionOutput<V, D> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ModelParseError([
      { path: [], message: `Expected object, received ${typeName(value)}` },
    ])
  }

  const input = value as Record<string, unknown>
  const tag = input[discriminant]
  const variant =
    typeof tag === 'string' &&
    Object.prototype.hasOwnProperty.call(variants, tag)
      ? variants[tag]
      : undefined

  if (variant === undefined) {
    throw new ModelParseError([
      {
        path: [],
        message: `Expected "${discriminant}" to be one of ${keys
          .map((key) => JSON.stringify(key))
          .join(', ')}`,
      },
    ])
  }

  const data = variant.parse(input[DATA_KEY])
  return {
    [discriminant]: tag,
    [DATA_KEY]: data,
  } as unknown as UnionOutput<V, D>
}

/**
 * Creates a discriminated union from a map of variant key → object schema.
 *
 * Variants are wrapped as `{ __type: key, data: variantValue }`. The default
 * discriminant is `__type`; pass an explicit key when a variant already has a
 * `__type` field.
 *
 * ```ts
 * const Shape = union({
 *   circle: object({ radius: number() }),
 *   square: object({ side: number() }),
 * })
 *
 * Shape.parse({ __type: 'circle', data: { radius: 2 } })
 * ```
 */
export function union<const V extends Record<string, UnionVariant>>(
  variants: V & (HasDefaultField<V> extends true ? never : unknown),
): DiscriminatedUnionSchema<'__type', V>
export function union<
  const V extends Record<string, UnionVariant>,
  const D extends string,
>(variants: V, discriminant: D): DiscriminatedUnionSchema<D, V>
export function union<
  const V extends Record<string, UnionVariant>,
  const D extends string = '__type',
>(variants: V, discriminant?: D): DiscriminatedUnionSchema<D, V> {
  assertVariants(variants)

  if (
    discriminant === undefined &&
    hasField(variants, DEFAULT_DISCRIMINANT)
  ) {
    throw new ModelDefinitionError(
      `Union variants contain a "${DEFAULT_DISCRIMINANT}" field; pass an explicit discriminant key`,
    )
  }

  const key = (discriminant ?? DEFAULT_DISCRIMINANT) as D
  const keys = Object.keys(variants)

  class UnionClass extends Model {
    constructor(value: unknown) {
      super()
      const target = new.target as unknown as typeof UnionClass
      return UnionClass.parse.call(target, value) as unknown as this
    }

    static readonly isOptional = false as const
    static readonly discriminant = key
    static readonly variants = variants
    static readonly dataKey = DATA_KEY

    static parse(this: Constructable, value: unknown): object {
      if (
        value instanceof (this as unknown as new (...args: never[]) => object) &&
        Object.isFrozen(value)
      ) {
        return value
      }
      const parsed = parseUnion(key, variants, keys, value)
      Object.setPrototypeOf(parsed, (this as unknown as { prototype: object }).prototype)
      return deepFreeze(parsed)
    }

    static safeParse(this: Constructable, value: unknown): ParseResult<object> {
      try {
        return { success: true, data: UnionClass.parse.call(this, value) }
      } catch (error) {
        if (error instanceof ModelParseError) {
          return { success: false, issues: error.issues }
        }
        throw error
      }
    }

    static toJSONSchema(): OneOfJsonSchema {
      return {
        oneOf: keys.map((variantKey) => ({
          type: 'object',
          properties: {
            [key]: { const: variantKey },
            [DATA_KEY]: variants[variantKey]!.toJSONSchema(),
          },
          required: [key, DATA_KEY],
          additionalProperties: false,
        })),
      }
    }

    static optional(): OptionalSchema<UnionOutput<V, D>, OneOfJsonSchema> {
      return makeOptional(
        UnionClass as unknown as RequiredSchemaClass<
          UnionOutput<V, D>,
          OneOfJsonSchema
        >,
      )
    }

    static nullable(): NullableSchema<UnionOutput<V, D>, OneOfJsonSchema> {
      return makeNullable(
        UnionClass as unknown as RequiredSchemaClass<
          UnionOutput<V, D>,
          OneOfJsonSchema
        >,
      )
    }

    static default(
      value: UnionOutput<V, D>,
    ): DefaultSchema<UnionOutput<V, D>, OneOfJsonSchema> {
      return makeDefault(
        UnionClass as unknown as RequiredSchemaClass<
          UnionOutput<V, D>,
          OneOfJsonSchema
        >,
        value,
      )
    }
  }

  return UnionClass as unknown as DiscriminatedUnionSchema<D, V>
}
