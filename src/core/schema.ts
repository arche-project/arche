// Validateur JSON Schema minimal (sous-ensemble draft 2020-12) — zéro dépendance.
// Couvre exactement ce qu'utilisent catalog/schema/*.json : type, required, properties, additionalProperties,
// enum, items, minItems, uniqueItems, pattern, minimum/maximum, format (uri) et $ref vers #/$defs.
// Choix délibéré : Ajv est excellent mais c'est 1 Mo de dépendances pour valider 6 fichiers YAML ;
// un outil de survie doit se compiler avec le moins de choses possible. La CI exécute en plus Ajv (devDependency)
// pour garantir la conformité complète du schéma (scripts/catalog/check-schema-ajv.ts).
//
// Minimal JSON Schema validator (draft 2020-12 subset), zero deps. See rationale above.

export interface SchemaError { path: string; message: string }
type Schema = Record<string, any>;

export function validate(schema: Schema, data: unknown, root: Schema = schema): SchemaError[] {
  const errors: SchemaError[] = [];
  walk(schema, data, '', root, errors);
  return errors;
}

function resolveRef(ref: string, root: Schema): Schema {
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref ${ref}`);
  return ref.slice(2).split('/').reduce((o, k) => o?.[k], root);
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function walk(schema: Schema, data: unknown, path: string, root: Schema, errors: SchemaError[]) {
  if (schema.$ref) schema = { ...resolveRef(schema.$ref, root), ...Object.fromEntries(Object.entries(schema).filter(([k]) => k !== '$ref')) };
  const err = (message: string) => errors.push({ path: path || '/', message });

  if (schema.type) {
    const allowed: string[] = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(data);
    const ok = allowed.some(t => t === actual || (t === 'number' && actual === 'integer'));
    if (!ok) { err(`must be ${allowed.join('|')}, got ${actual}`); return; }
  }
  if (schema.enum && !schema.enum.some((e: unknown) => e === data)) err(`must be one of ${schema.enum.join(', ')}`);
  if (typeof data === 'string') {
    if (schema.pattern && !new RegExp(schema.pattern).test(data)) err(`must match ${schema.pattern}`);
    if (schema.format === 'uri') { try { new URL(data); } catch { err('must be a valid URI'); } }
  }
  if (typeof data === 'number') {
    if (schema.minimum != null && data < schema.minimum) err(`must be >= ${schema.minimum}`);
    if (schema.maximum != null && data > schema.maximum) err(`must be <= ${schema.maximum}`);
  }
  if (Array.isArray(data)) {
    if (schema.minItems != null && data.length < schema.minItems) err(`must have at least ${schema.minItems} items`);
    if (schema.uniqueItems && new Set(data.map(x => JSON.stringify(x))).size !== data.length) err('items must be unique');
    if (schema.items) data.forEach((item, i) => walk(schema.items, item, `${path}/${i}`, root, errors));
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    for (const k of schema.required ?? []) if (!(k in obj)) err(`missing required property "${k}"`);
    const props: Record<string, Schema> = schema.properties ?? {};
    for (const [k, v] of Object.entries(obj)) {
      if (props[k]) walk(props[k], v, `${path}/${k}`, root, errors);
      else if (schema.additionalProperties === false) err(`unexpected property "${k}"`);
    }
  }
}
