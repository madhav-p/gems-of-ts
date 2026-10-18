export type StringJsonSchema = {
  type: 'string'
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
}

export type NumberJsonSchema = {
  type: 'number' | 'integer'
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
}

export type BooleanJsonSchema = {
  type: 'boolean'
}

export type ArrayJsonSchema = {
  type: 'array'
  items: JsonSchema
  minItems?: number
  maxItems?: number
}

export type ObjectJsonSchema = {
  type: 'object'
  properties: Record<string, JsonSchema>
  required: string[]
  additionalProperties: boolean
}

export type JsonSchema =
  | StringJsonSchema
  | NumberJsonSchema
  | BooleanJsonSchema
  | ArrayJsonSchema
  | ObjectJsonSchema
