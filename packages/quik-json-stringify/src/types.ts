export type JSONSchemaType = 'string' | 'integer' | 'number' | 'boolean' | 'null' | 'object' | 'array';

export interface JSONSchema {
  type?: JSONSchemaType | JSONSchemaType[];
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  nullable?: boolean;
  enum?: any[];
  // Allow additional keywords
  [key: string]: any;
}

export type QuikSerializer = (obj: any) => string;
