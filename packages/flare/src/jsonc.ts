export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface JsoncProperty {
  key: string;
  keyStart: number;
  valueNode: JsoncNode;
}

export interface JsoncNode {
  type: "array" | "object" | "primitive";
  start: number;
  end: number;
  value: JsonValue;
  properties?: JsoncProperty[];
  elements?: JsoncNode[];
}

export function parseJsonc(source: string, sourceName = "JSONC input"): JsoncNode {
  let index = 0;

  const fail = (message: string): never => {
    throw new SyntaxError(`${sourceName}: ${message} at offset ${index}`);
  };

  const skipTrivia = () => {
    while (index < source.length) {
      const char = source[index];
      if (char === undefined) break;
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === "/" && source[index + 1] === "/") {
        index += 2;
        while (index < source.length && source[index] !== "\n" && source[index] !== "\r") {
          index += 1;
        }
        continue;
      }
      if (char === "/" && source[index + 1] === "*") {
        const close = source.indexOf("*/", index + 2);
        if (close === -1) fail("unterminated block comment");
        index = close + 2;
        continue;
      }
      break;
    }
  };

  const parseString = (): { value: string; start: number; end: number } => {
    const start = index;
    if (source[index] !== '"') return fail("expected a quoted string");
    index += 1;
    let escaped = false;
    while (index < source.length) {
      const char = source[index];
      if (escaped) {
        escaped = false;
        index += 1;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        index += 1;
        continue;
      }
      if (char === '"') {
        index += 1;
        const raw = source.slice(start, index);
        try {
          return { value: JSON.parse(raw) as string, start, end: index };
        } catch {
          return fail("invalid string escape");
        }
      }
      if (char === "\n" || char === "\r") fail("unescaped line break in string");
      index += 1;
    }
    return fail("unterminated string");
  };

  const parseValue = (): JsoncNode => {
    skipTrivia();
    const start = index;
    const char = source[index];

    if (char === "{") {
      index += 1;
      skipTrivia();
      const properties: JsoncProperty[] = [];
      const objectValue: { [key: string]: JsonValue } = {};
      const seen = new Set<string>();
      while (source[index] !== "}") {
        if (index >= source.length) fail("unterminated object");
        const key = parseString();
        if (seen.has(key.value)) fail(`duplicate property ${JSON.stringify(key.value)}`);
        seen.add(key.value);
        skipTrivia();
        if (source[index] !== ":") fail("expected ':' after object key");
        index += 1;
        const valueNode = parseValue();
        properties.push({ key: key.value, keyStart: key.start, valueNode });
        objectValue[key.value] = valueNode.value;
        skipTrivia();
        if (source[index] === "}") break;
        if (source[index] !== ",") fail("expected ',' or '}' in object");
        index += 1;
        skipTrivia();
        if (source[index] === "}") break;
      }
      if (source[index] !== "}") fail("unterminated object");
      index += 1;
      return { type: "object", start, end: index, value: objectValue, properties };
    }

    if (char === "[") {
      index += 1;
      skipTrivia();
      const elements: JsoncNode[] = [];
      while (source[index] !== "]") {
        if (index >= source.length) fail("unterminated array");
        elements.push(parseValue());
        skipTrivia();
        if (source[index] === "]") break;
        if (source[index] !== ",") fail("expected ',' or ']' in array");
        index += 1;
        skipTrivia();
        if (source[index] === "]") break;
      }
      if (source[index] !== "]") fail("unterminated array");
      index += 1;
      return {
        type: "array",
        start,
        end: index,
        value: elements.map((element) => element.value),
        elements,
      };
    }

    if (char === '"') {
      const parsed = parseString();
      return { type: "primitive", start: parsed.start, end: parsed.end, value: parsed.value };
    }

    const literal = source.slice(index).match(/^(?:true|false|null)(?![\w$])/);
    if (literal) {
      index += literal[0].length;
      const value = literal[0] === "true" ? true : literal[0] === "false" ? false : null;
      return { type: "primitive", start, end: index, value };
    }

    const number = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      index += number[0].length;
      return { type: "primitive", start, end: index, value: Number(number[0]) };
    }

    return fail("expected a JSON value");
  };

  const root = parseValue();
  skipTrivia();
  if (index !== source.length) fail("unexpected content after root value");
  return root;
}

export function getProperty(node: JsoncNode, key: string): JsoncNode | undefined {
  if (node.type !== "object") return undefined;
  return node.properties?.find((property) => property.key === key)?.valueNode;
}

export function getObject(node: JsoncNode | undefined): Record<string, JsonValue> | undefined {
  if (!node || node.type !== "object" || Array.isArray(node.value) || node.value === null) {
    return undefined;
  }
  return node.value as Record<string, JsonValue>;
}

export function getArray(node: JsoncNode | undefined): JsoncNode[] | undefined {
  if (!node || node.type !== "array") return undefined;
  return node.elements;
}

export function replaceStringNodes(
  source: string,
  replacements: Array<{ node: JsoncNode; value: string }>,
): string {
  const sorted = [...replacements].sort((a, b) => b.node.start - a.node.start);
  let result = source;
  let previousStart = source.length + 1;
  for (const replacement of sorted) {
    const { start, end } = replacement.node;
    if (replacement.node.type !== "primitive" || typeof replacement.node.value !== "string") {
      throw new TypeError("Only existing string values can be replaced in Wrangler config.");
    }
    if (end > previousStart) throw new Error("Overlapping Wrangler config edits were detected.");
    result = `${result.slice(0, start)}${JSON.stringify(replacement.value)}${result.slice(end)}`;
    previousStart = start;
  }
  return result;
}
