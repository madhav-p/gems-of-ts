import type { JsonSchema, ObjectJsonSchema } from './json-schema'
import type { SchemaClass, SchemaIssue } from './schema'
import { SchemaParseError, typeName } from './schema'

function isArrayIndex(property: string): boolean {
  return /^(0|[1-9]\d*)$/.test(property)
}

/**
 * Wraps a parsed object so that every property mutation re-parses the value
 * against that field's schema: assignment (`set`), `Object.defineProperty`
 * (`defineProperty`), and `delete` (`deleteProperty`, rejected for required
 * fields). Unknown keys are ignored (stripped).
 */
export function wrapObject<O extends Record<string, unknown>>(
  target: O,
  shape: Record<string, SchemaClass<unknown>>,
): O {
  return new Proxy(target, {
    set(object, property, value) {
      if (typeof property !== 'string') {
        return Reflect.set(object, property, value)
      }
      const field = shape[property]
      if (!field) {
        return true
      }
      Reflect.set(object, property, field.parse(value))
      return true
    },
    defineProperty(object, property, descriptor) {
      if (typeof property !== 'string') {
        return Reflect.defineProperty(object, property, descriptor)
      }
      const field = shape[property]
      if (!field) {
        return true
      }
      if (!('value' in descriptor)) {
        return Reflect.defineProperty(object, property, descriptor)
      }
      return Reflect.defineProperty(object, property, {
        ...descriptor,
        value: field.parse(descriptor.value),
      })
    },
    deleteProperty(object, property) {
      if (typeof property !== 'string') {
        return Reflect.deleteProperty(object, property)
      }
      const field = shape[property]
      if (!field) {
        return true
      }
      if (!field.isOptional) {
        throw new SchemaParseError([
          { path: [property], message: 'Cannot delete a required property' },
        ])
      }
      return Reflect.deleteProperty(object, property)
    },
  })
}

/**
 * Wraps a parsed array so that every mutating operation re-parses incoming
 * values and re-checks the length bounds: index assignment (`set`),
 * `Object.defineProperty`, `delete`, and `push` / `unshift` / `splice` / `fill`
 * / `pop` / `shift` / `length`.
 */
export function wrapArray<T>(
  target: T[],
  element: SchemaClass<T>,
  minItems?: number,
  maxItems?: number,
): T[] {
  function assertLength(array: unknown[]): void {
    if (minItems !== undefined && array.length < minItems) {
      throw new SchemaParseError([{ path: [], message: `Expected at least ${minItems} items` }])
    }
    if (maxItems !== undefined && array.length > maxItems) {
      throw new SchemaParseError([{ path: [], message: `Expected at most ${maxItems} items` }])
    }
  }

  return new Proxy(target, {
    get(array, property, receiver) {
      switch (property) {
        case 'push':
          return (...items: unknown[]) => {
            const result = array.push(...items.map((item) => element.parse(item)))
            assertLength(array)
            return result
          }
        case 'unshift':
          return (...items: unknown[]) => {
            const result = array.unshift(...items.map((item) => element.parse(item)))
            assertLength(array)
            return result
          }
        case 'splice':
          return (start: number, deleteCount?: number, ...items: unknown[]) => {
            const parsed = items.map((item) => element.parse(item))
            const result = array.splice(
              start,
              deleteCount ?? array.length - start,
              ...parsed,
            )
            assertLength(array)
            return result
          }
        case 'fill':
          return (value: unknown, start?: number, end?: number) =>
            array.fill(element.parse(value), start, end)
        case 'pop':
          return () => {
            const result = array.pop()
            assertLength(array)
            return result
          }
        case 'shift':
          return () => {
            const result = array.shift()
            assertLength(array)
            return result
          }
        default:
          return Reflect.get(array, property, receiver)
      }
    },
    set(array, property, value) {
      if (typeof property === 'string' && isArrayIndex(property)) {
        array[Number(property)] = element.parse(value)
        return true
      }
      if (property === 'length' && typeof value === 'number' && value > array.length) {
        // growing by truncating/expanding creates holes — `undefined` elements
        element.parse(undefined)
      }
      const ok = Reflect.set(array, property, value)
      if (property === 'length') {
        assertLength(array)
      }
      return ok
    },
    defineProperty(array, property, descriptor) {
      if (typeof property === 'string' && isArrayIndex(property) && 'value' in descriptor) {
        return Reflect.defineProperty(array, property, {
          ...descriptor,
          value: element.parse(descriptor.value),
        })
      }
      return Reflect.defineProperty(array, property, descriptor)
    },
    deleteProperty(array, property) {
      if (typeof property === 'string' && isArrayIndex(property)) {
        // deleting an element leaves `undefined` behind
        element.parse(undefined)
      }
      return Reflect.deleteProperty(array, property)
    },
  })
}

export function parseObject<O>(shape: Record<string, SchemaClass<unknown>>, value: unknown): O {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SchemaParseError([
      { path: [], message: `Expected object, received ${typeName(value)}` },
    ])
  }

  const input = value as Record<string, unknown>
  const issues: SchemaIssue[] = []
  const output: Record<string, unknown> = {}

  for (const key of Object.keys(shape)) {
    const field = shape[key]
    if (!field) {
      continue
    }
    const raw = input[key]
    if (raw === undefined && field.isOptional) {
      continue
    }
    try {
      output[key] = field.parse(raw)
    } catch (error) {
      if (error instanceof SchemaParseError) {
        for (const issue of error.issues) {
          issues.push({ path: [key, ...issue.path], message: issue.message })
        }
      } else {
        throw error
      }
    }
  }

  if (issues.length > 0) {
    throw new SchemaParseError(issues)
  }
  return wrapObject(output, shape) as O
}

export function parseArray<T>(
  element: SchemaClass<T>,
  value: unknown,
  minItems?: number,
  maxItems?: number,
): T[] {
  if (!Array.isArray(value)) {
    throw new SchemaParseError([
      { path: [], message: `Expected array, received ${typeName(value)}` },
    ])
  }

  const issues: SchemaIssue[] = []
  if (minItems !== undefined && value.length < minItems) {
    issues.push({ path: [], message: `Expected at least ${minItems} items` })
  }
  if (maxItems !== undefined && value.length > maxItems) {
    issues.push({ path: [], message: `Expected at most ${maxItems} items` })
  }

  const output: T[] = []
  value.forEach((item, index) => {
    try {
      output.push(element.parse(item))
    } catch (error) {
      if (error instanceof SchemaParseError) {
        for (const issue of error.issues) {
          issues.push({ path: [index, ...issue.path], message: issue.message })
        }
      } else {
        throw error
      }
    }
  })

  if (issues.length > 0) {
    throw new SchemaParseError(issues)
  }
  return wrapArray(output, element, minItems, maxItems)
}

/**
 * Compiles an object shape to a standalone validator. Unlike `parseObject` it
 * builds a plain object (no proxy / prototype), and it pre-resolves each field's
 * compiled validator once.
 */
export function compileObject<O>(
  shape: Record<string, SchemaClass<unknown>>,
): (value: unknown) => O {
  const entries = Object.keys(shape).map((key) => {
    const schema = shape[key]!
    return { key, optional: schema.isOptional, validate: schema.compile() }
  })

  return (value: unknown): O => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new SchemaParseError([
        { path: [], message: `Expected object, received ${typeName(value)}` },
      ])
    }

    const input = value as Record<string, unknown>
    const issues: SchemaIssue[] = []
    const output: Record<string, unknown> = {}

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!
      const raw = input[entry.key]
      if (raw === undefined && entry.optional) {
        continue
      }
      try {
        output[entry.key] = entry.validate(raw)
      } catch (error) {
        if (error instanceof SchemaParseError) {
          for (const issue of error.issues) {
            issues.push({ path: [entry.key, ...issue.path], message: issue.message })
          }
        } else {
          throw error
        }
      }
    }

    if (issues.length > 0) {
      throw new SchemaParseError(issues)
    }
    return output as O
  }
}

/** Compiles an element schema to a standalone array validator (no proxy). */
export function compileArray<T>(
  element: SchemaClass<T>,
  minItems?: number,
  maxItems?: number,
): (value: unknown) => T[] {
  const validate = element.compile()

  return (value: unknown): T[] => {
    if (!Array.isArray(value)) {
      throw new SchemaParseError([
        { path: [], message: `Expected array, received ${typeName(value)}` },
      ])
    }

    const issues: SchemaIssue[] = []
    if (minItems !== undefined && value.length < minItems) {
      issues.push({ path: [], message: `Expected at least ${minItems} items` })
    }
    if (maxItems !== undefined && value.length > maxItems) {
      issues.push({ path: [], message: `Expected at most ${maxItems} items` })
    }

    const output: T[] = new Array(value.length)
    for (let i = 0; i < value.length; i++) {
      try {
        output[i] = validate(value[i])
      } catch (error) {
        if (error instanceof SchemaParseError) {
          for (const issue of error.issues) {
            issues.push({ path: [i, ...issue.path], message: issue.message })
          }
        } else {
          throw error
        }
      }
    }

    if (issues.length > 0) {
      throw new SchemaParseError(issues)
    }
    return output
  }
}

export function objectJSONSchema(shape: Record<string, SchemaClass<unknown>>): ObjectJsonSchema {
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []

  for (const key of Object.keys(shape)) {
    const field = shape[key]
    if (!field) {
      continue
    }
    properties[key] = field.toJSONSchema()
    if (!field.isOptional) {
      required.push(key)
    }
  }

  return { type: 'object', properties, required, additionalProperties: false }
}
