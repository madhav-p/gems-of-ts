export type BoundedNumberJsonSchema = {
  type: 'number' | 'integer'
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  exclusiveMaximum?: number
  multipleOf?: number
}

export type NumberJsonSchema = { const: number } | BoundedNumberJsonSchema

export type BoundedStringJsonSchema = {
  type: 'string'
  minLength?: number
  maxLength?: number
  pattern?: string
  format?: string
}

export type StringJsonSchema = { const: string } | BoundedStringJsonSchema

export type BooleanJsonSchema = {
  type: 'boolean'
}

export type LiteralValue = string | number | boolean | null

export type LiteralJsonSchema = {
  const: LiteralValue
}

export type EnumJsonSchema = {
  enum: LiteralValue[]
}

export type NullJsonSchema = {
  type: 'null'
}

export type ListJsonSchema = {
  type: 'array'
  items: JsonSchema
  minItems?: number
  maxItems?: number
}

export type TupleJsonSchema = {
  type: 'array'
  prefixItems: JsonSchema[]
  items: false
  minItems: number
  maxItems: number
}

export type AnyOfJsonSchema = {
  anyOf: JsonSchema[]
}

export type OneOfJsonSchema = {
  oneOf: JsonSchema[]
}

export type AllOfJsonSchema = {
  allOf: JsonSchema[]
}

export type ObjectJsonSchema = {
  type: 'object'
  properties: Record<string, JsonSchema>
  required: string[]
  additionalProperties: false
}

export type RecordJsonSchema = {
  type: 'object'
  additionalProperties: JsonSchema
}

export type JsonSchema =
  | NumberJsonSchema
  | StringJsonSchema
  | BooleanJsonSchema
  | NullJsonSchema
  | LiteralJsonSchema
  | EnumJsonSchema
  | ListJsonSchema
  | TupleJsonSchema
  | ObjectJsonSchema
  | RecordJsonSchema
  | AnyOfJsonSchema
  | OneOfJsonSchema
  | AllOfJsonSchema
