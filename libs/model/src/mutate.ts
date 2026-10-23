import { ModelDefinitionError, ModelParseError } from './errors'
import { deepFreeze, isParsed, type Draft, type ModelBrand } from './schema'

/**
 * Applies an Immer-style recipe to a mutable draft and validates only the
 * changed parts of the result. Unchanged subtrees are retained by reference
 * from the source value, so `next.address === user.address` when only another
 * field changed.
 *
 * ```ts
 * const next = mutate(User, user, (draft) => {
 *   draft.name = 'Grace'
 *   draft.tags.push('admin')
 * })
 * ```
 */
export function mutate<T>(
  input: T & ModelBrand,
  recipe: (draft: Draft<T>) => void | Draft<T>,
): T & ModelBrand {
  if (!isParsed(input)) {
    throw new ModelDefinitionError(
      'mutate expects a value produced by parse/new, not a raw object.',
    )
  }

  const schema = inferSchema(input)
  const base = schema.parse(input) as T & ModelBrand
  const draft = deepClone(base) as Draft<T>
  const result = recipe(draft) ?? draft
  return reconcile(schema, base, result) as T & ModelBrand
}

/**
 * Recovers the schema class from a parsed instance. Object/list parse outputs
 * have the schema class as their prototype, so its static `fields`/`element`
 * (and inherited static parse) are available.
 */
function inferSchema(value: unknown): ReconcileSchema {
  if (value !== null && typeof value === 'object') {
    const ctor = (value as { constructor?: unknown }).constructor
    if (typeof ctor === 'function') {
      const schema = ctor as Partial<ReconcileSchema>
      if (
        typeof (ctor as { parse?: unknown }).parse === 'function' &&
        (schema.fields !== undefined ||
          schema.element !== undefined ||
          schema.values !== undefined ||
          (schema.items !== undefined && Array.isArray(schema.items)) ||
          (schema.variants !== undefined &&
            typeof schema.discriminant === 'string'))
      ) {
        return ctor as unknown as ReconcileSchema
      }
    }
  }

  throw new ModelDefinitionError(
    'Cannot infer a model schema from this value. mutate only accepts values created by parse/new.',
  )
}

type ReconcileSchema = {
  parse(value: unknown): unknown
  readonly isOptional?: boolean
  readonly inner?: ReconcileSchema
  readonly fields?: Record<string, ReconcileSchema>
  readonly element?: ReconcileSchema
  readonly values?: ReconcileSchema
  readonly items?: readonly ReconcileSchema[]
  readonly hasDefault?: boolean
  readonly variants?: Record<string, ReconcileSchema>
  readonly discriminant?: string
  readonly dataKey?: string
  readonly minItems?: number
  readonly maxItems?: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Rebuilds a value from `base` and a changed `draft`, reusing every subtree that
 * is deep-equal to the source. Only changed leaves go through `schema.parse`.
 */
function reconcile(
  schema: ReconcileSchema,
  base: unknown,
  draft: unknown,
): unknown {
  if (Object.is(base, draft)) {
    return base
  }
  if (deepEqual(base, draft)) {
    return base
  }

  if (schema.isOptional === true && schema.inner) {
    if (draft === undefined) {
      return undefined
    }
    if (base === undefined) {
      return schema.parse(draft)
    }
    return reconcile(schema.inner, base, draft)
  }

  if (schema.fields !== undefined) {
    if (isObject(base) && isObject(draft)) {
      return reconcileObject(schema, base, draft)
    }
    return schema.parse(draft)
  }

  if (schema.element !== undefined) {
    if (Array.isArray(base) && Array.isArray(draft)) {
      return reconcileList(schema, base, draft)
    }
    return schema.parse(draft)
  }

  if (schema.values !== undefined) {
    if (isObject(base) && isObject(draft)) {
      return reconcileRecord(schema, base, draft)
    }
    return schema.parse(draft)
  }

  if (schema.items !== undefined && Array.isArray(schema.items)) {
    if (Array.isArray(base) && Array.isArray(draft)) {
      return reconcileTuple(schema, base, draft)
    }
    return schema.parse(draft)
  }

  if (schema.variants !== undefined && typeof schema.discriminant === 'string') {
    return reconcileUnion(schema, base, draft)
  }

  return schema.parse(draft)
}

function reconcileObject(
  schema: ReconcileSchema,
  base: Record<string, unknown>,
  draft: Record<string, unknown>,
): unknown {
  const fields = schema.fields!
  const output = Object.create(Object.getPrototypeOf(base)) as Record<string, unknown>
  let changed = false

  for (const key of Object.keys(fields)) {
    const field = fields[key]!
    const baseValue = base[key]
    const draftValue = draft[key]

    if (draftValue === undefined) {
      if (field.isOptional) {
        if (baseValue !== undefined) {
          changed = true
        }
        continue
      }
      if (field.hasDefault) {
        output[key] = field.parse(undefined)
        changed = true
        continue
      }
      // Required field removed: let the field schema produce the parse error.
      field.parse(undefined)
      continue
    }

    if (baseValue === undefined) {
      output[key] = field.parse(draftValue)
      changed = true
      continue
    }

    if (baseValue === draftValue) {
      output[key] = baseValue
      continue
    }

    const next = reconcile(field, baseValue, draftValue)
    output[key] = next
    if (next !== baseValue) {
      changed = true
    }
  }

  if (!changed) {
    return base
  }
  return deepFreeze(output)
}

function reconcileList(
  schema: ReconcileSchema,
  base: unknown[],
  draft: unknown[],
): unknown {
  if (schema.minItems !== undefined && draft.length < schema.minItems) {
    throw new ModelParseError([
      { path: [], message: `Expected at least ${schema.minItems} items` },
    ])
  }
  if (schema.maxItems !== undefined && draft.length > schema.maxItems) {
    throw new ModelParseError([
      { path: [], message: `Expected at most ${schema.maxItems} items` },
    ])
  }

  const element = schema.element!
  const output: unknown[] = []
  let changed = base.length !== draft.length

  for (let index = 0; index < draft.length; index++) {
    const draftValue = draft[index]

    if (index >= base.length) {
      output.push(element.parse(draftValue))
      changed = true
      continue
    }

    const baseValue = base[index]
    if (baseValue === draftValue) {
      output.push(baseValue)
      continue
    }

    const next = reconcile(element, baseValue, draftValue)
    output.push(next)
    if (next !== baseValue) {
      changed = true
    }
  }

  if (!changed) {
    return base
  }
  Object.setPrototypeOf(output, Object.getPrototypeOf(base))
  return deepFreeze(output)
}

function reconcileUnion(
  schema: ReconcileSchema,
  base: unknown,
  draft: unknown,
): unknown {
  if (!isObject(base) || !isObject(draft)) {
    return schema.parse(draft)
  }

  const discriminant = schema.discriminant!
  const dataKey = schema.dataKey ?? 'data'
  const baseTag = base[discriminant]
  const draftTag = draft[discriminant]
  const variants = schema.variants!

  if (
    typeof draftTag !== 'string' ||
    !Object.prototype.hasOwnProperty.call(variants, draftTag)
  ) {
    return schema.parse(draft)
  }

  if (baseTag !== draftTag) {
    return schema.parse(draft)
  }

  const variant = variants[draftTag]!
  const baseData = base[dataKey]
  const draftData = draft[dataKey]
  const nextData = reconcile(variant, baseData, draftData)
  if (nextData === baseData) {
    return base
  }

  const output = Object.create(Object.getPrototypeOf(base)) as Record<string, unknown>
  output[discriminant] = draftTag
  output[dataKey] = nextData
  return deepFreeze(output)
}

function reconcileTuple(
  schema: ReconcileSchema,
  base: unknown[],
  draft: unknown[],
): unknown {
  if (schema.minItems !== undefined && draft.length < schema.minItems) {
    throw new ModelParseError([
      { path: [], message: `Expected at least ${schema.minItems} items` },
    ])
  }
  if (schema.maxItems !== undefined && draft.length > schema.maxItems) {
    throw new ModelParseError([
      { path: [], message: `Expected at most ${schema.maxItems} items` },
    ])
  }

  const items = schema.items!
  if (base.length !== draft.length || draft.length !== items.length) {
    return schema.parse(draft)
  }

  const output: unknown[] = []
  let changed = false

  for (let index = 0; index < items.length; index++) {
    const item = items[index]!
    const baseValue = base[index]
    const draftValue = draft[index]

    if (baseValue === draftValue) {
      output.push(baseValue)
      continue
    }

    const next = reconcile(item, baseValue, draftValue)
    output.push(next)
    if (next !== baseValue) {
      changed = true
    }
  }

  if (!changed) {
    return base
  }
  Object.setPrototypeOf(output, Object.getPrototypeOf(base))
  return deepFreeze(output)
}

function reconcileRecord(
  schema: ReconcileSchema,
  base: Record<string, unknown>,
  draft: Record<string, unknown>,
): unknown {
  const valueSchema = schema.values!
  const output = Object.create(Object.getPrototypeOf(base)) as Record<string, unknown>
  const baseKeys = Object.keys(base)
  const draftKeys = Object.keys(draft)
  let changed = baseKeys.length !== draftKeys.length

  for (const key of draftKeys) {
    const baseValue = base[key]
    const draftValue = draft[key]

    if (baseValue === undefined) {
      output[key] = valueSchema.parse(draftValue)
      changed = true
      continue
    }

    if (baseValue === draftValue) {
      output[key] = baseValue
      continue
    }

    const next = reconcile(valueSchema, baseValue, draftValue)
    output[key] = next
    if (next !== baseValue) {
      changed = true
    }
  }

  if (!changed) {
    return base
  }
  return deepFreeze(output)
}

/**
 * Clones a structured value deeply, keeping prototypes so subclass methods stay
 * available on drafts. Class private fields and non-enumerable properties are
 * not copied (see the README concerns).
 */
function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    const output: unknown[] = []
    for (const item of value) {
      output.push(deepClone(item))
    }
    Object.setPrototypeOf(output, Object.getPrototypeOf(value))
    return output as T
  }
  if (value !== null && typeof value === 'object') {
    const output = Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>
    for (const key of Object.keys(value)) {
      output[key] = deepClone((value as Record<string, unknown>)[key])
    }
    return output as T
  }
  return value
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) {
    return true
  }
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) {
    return false
  }

  const aIsArray = Array.isArray(a)
  const bIsArray = Array.isArray(b)
  if (aIsArray !== bIsArray) {
    return false
  }
  if (aIsArray && bIsArray) {
    if (a.length !== b.length) {
      return false
    }
    for (let index = 0; index < a.length; index++) {
      if (!deepEqual(a[index], b[index])) {
        return false
      }
    }
    return true
  }

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) {
    return false
  }
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      return false
    }
    if (
      !deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      )
    ) {
      return false
    }
  }
  return true
}
