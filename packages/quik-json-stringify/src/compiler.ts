import type { JSONSchema, QuikSerializer } from './types';

/**
 * Escape a string for safe JSON embedding.
 * Handles the characters that would otherwise break the JSON string literal.
 */
function escapeString(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (char === '"') result += '\\"';
    else if (char === '\\') result += '\\\\';
    else if (char === '\n') result += '\\n';
    else if (char === '\r') result += '\\r';
    else if (char === '\t') result += '\\t';
    else result += char;
  }
  return result;
}

/**
 * Resolve the primary type from a JSONSchema, handling both single string
 * and array-of-strings type declarations.
 *
 * When the type array contains 'null' alongside another type, the non-null
 * type is treated as primary. This mirrors the common JSON Schema pattern
 * `{ "type": ["string", "null"] }` for nullable fields.
 */
function resolvePrimaryType(schema: JSONSchema): string | undefined {
  if (!schema.type) return undefined;

  if (typeof schema.type === 'string') {
    return schema.type;
  }

  // Array of types — pick first non-null type, flag as nullable implicitly
  const types = schema.type as string[];
  const nonNull = types.filter((t) => t !== 'null');
  return nonNull[0];
}

/**
 * Returns whether the schema allows null values — either via nullable flag,
 * a 'null' entry in a type array, or a plain 'null' type.
 */
function isNullable(schema: JSONSchema): boolean {
  if (schema.nullable === true) return true;
  if (schema.type === 'null') return true;
  if (Array.isArray(schema.type) && (schema.type as string[]).includes('null')) return true;
  return false;
}

/**
 * compile(schema, accessor) — returns a JS expression string that, when
 * evaluated, produces the JSON-serialized form of the value at `accessor`.
 *
 * `accessor` is a JavaScript expression pointing at the value in scope,
 * e.g. `'obj'`, `'obj.name'`, `'obj["some-key"]'`, `'arr[i]'`.
 */
function compile(schema: JSONSchema, accessor: string): string {
  // anyOf / oneOf — no static type guarantee, fall back to JSON.stringify
  if (schema.anyOf || schema.oneOf) {
    return `JSON.stringify(${accessor})`;
  }

  // enum values — fall back to JSON.stringify (values can be mixed types)
  if (schema.enum) {
    return `JSON.stringify(${accessor})`;
  }

  const primaryType = resolvePrimaryType(schema);
  const nullable = isNullable(schema);

  // Wrap in null-guard when the field is nullable
  const wrapNullable = (inner: string): string => {
    if (!nullable) return inner;
    return `(${accessor} == null ? "null" : ${inner})`;
  };

  switch (primaryType) {
    case 'string':
      return wrapNullable(`'"' + escapeString(String(${accessor})) + '"'`);

    case 'integer':
    case 'number':
      return wrapNullable(`+(${accessor})`);

    case 'boolean':
      return wrapNullable(`(${accessor} ? "true" : "false")`);

    case 'null':
      return '"null"';

    case 'object': {
      if (!schema.properties) {
        // No declared properties — fall back
        return `JSON.stringify(${accessor})`;
      }
      // Wrap in an IIFE so each nested object gets its own `obj` binding,
      // preventing accessor path collisions in deeply nested structures.
      // The IIFE parameter is always named `obj`, so generateObjectBody
      // must receive `'obj'` as the local accessor.
      const body = generateObjectBody(schema, 'obj');
      return `(function(obj){ ${body} })(${accessor})`;
    }

    case 'array': {
      if (!schema.items) {
        return `JSON.stringify(${accessor})`;
      }
      // Wrap in an IIFE so the loop variable `arr` doesn't collide with
      // outer scope variables in nested array schemas.
      const itemExpr = compile(schema.items, 'arr[i]');
      const body = [
        'var parts = [];',
        'for (var i = 0; i < arr.length; i++) {',
        '  parts.push(' + itemExpr + ');',
        '}',
        'return "[" + parts.join(",") + "]";',
      ].join('\n');
      return `(function(arr){ ${body} })(${accessor})`;
    }

    default:
      // Unknown or missing type — safe fallback
      return `JSON.stringify(${accessor})`;
  }
}

/**
 * generateObjectBody(schema, accessor) — returns the full function body
 * (as a string) for serializing an object. The caller is responsible for
 * wrapping it in `function(obj){ ... }` if needed.
 *
 * Uses a `parts` array + `parts.join(',')` approach so optional fields
 * can be skipped cleanly without leaving stray commas.
 */
function generateObjectBody(schema: JSONSchema, accessor: string): string {
  const lines: string[] = [];
  const required = new Set(schema.required ?? []);
  const properties = schema.properties ?? {};

  lines.push('var parts = [];');

  for (const [key, propSchema] of Object.entries(properties)) {
    // Use bracket notation to handle keys with special characters
    const propAccessor = `${accessor}[${JSON.stringify(key)}]`;

    // The JSON key fragment: a JS string literal that evaluates to `"keyname":`
    // e.g. for key "id" → '"id":' so that parts.join(',') produces "id":value
    const keyFragment = `'"${escapeString(key)}":' `;
    const valueExpr = compile(propSchema, propAccessor);

    if (required.has(key)) {
      // Always include required fields
      lines.push(`parts.push(${keyFragment}+ ${valueExpr});`);
    } else {
      // Only include optional fields when they are present
      lines.push(`if (${propAccessor} !== undefined) {`);
      lines.push(`  parts.push(${keyFragment}+ ${valueExpr});`);
      lines.push('}');
    }
  }

  lines.push('return "{" + parts.join(",") + "}";');
  return lines.join('\n');
}

/**
 * generateFunctionBody(schema, accessor) — returns the top-level function
 * body string. For object schemas the body is generated directly; for all
 * other types a simple `return <expr>;` is emitted.
 */
function generateFunctionBody(schema: JSONSchema, accessor: string): string {
  // anyOf / oneOf at top level
  if (schema.anyOf || schema.oneOf) {
    return `return JSON.stringify(${accessor});`;
  }

  const primaryType = resolvePrimaryType(schema);

  if (primaryType === 'object' && schema.properties) {
    return generateObjectBody(schema, accessor);
  }

  // For all other top-level types, delegate to compile() and wrap in return
  return `return ${compile(schema, accessor)};`;
}

/**
 * build(schema) — compiles a JSONSchema into a specialized serializer
 * function. The returned function accepts a value and returns its JSON
 * string representation, significantly faster than JSON.stringify for
 * known-shape objects because there is no reflection at call time.
 *
 * Falls back to JSON.stringify if code generation throws.
 */
export function build(schema: JSONSchema): QuikSerializer {
  const body = generateFunctionBody(schema, 'obj');

  try {
    // escapeString and JSON are injected via closure so the generated code
    // can reference them without them being global.
    return new Function('escapeString', 'JSON', `return function(obj){ ${body} };`)(
      escapeString,
      JSON
    ) as QuikSerializer;
  } catch (_e) {
    // Code generation failed — safe fallback
    return (obj: any) => JSON.stringify(obj);
  }
}
