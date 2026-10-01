import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type EnvValues = Map<string, string>;

export function parseEnvText(source: string, sourceName: string): EnvValues {
  const values: EnvValues = new Map();
  for (const [index, rawLine] of source.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) throw new Error(`${sourceName}:${index + 1} is not a KEY=VALUE entry.`);
    const key = match[1];
    const rawValue = match[2];
    if (!key || rawValue === undefined)
      throw new Error(`${sourceName}:${index + 1} is not a KEY=VALUE entry.`);
    if (values.has(key)) throw new Error(`${sourceName}:${index + 1} repeats secret ${key}.`);
    const value = rawValue.trim();
    values.set(key, unquoteValue(value));
  }
  return values;
}

function unquoteValue(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

export function serializeSecretValues(values: Record<string, string>): string {
  return JSON.stringify(values);
}

export function readSecretFile(
  file: string,
  allowedNames: string[],
): {
  values: Record<string, string>;
  missing: string[];
  extra: string[];
} {
  if (!existsSync(file)) {
    return { values: {}, missing: [...allowedNames], extra: [] };
  }
  const parsed = parseEnvText(readFileSync(file, "utf8"), file);
  const allowed = new Set(allowedNames);
  const values: Record<string, string> = {};
  const missing: string[] = [];
  const extra: string[] = [];
  for (const name of allowedNames) {
    const value = parsed.get(name);
    if (value) values[name] = value;
    else missing.push(name);
  }
  for (const name of parsed.keys()) {
    if (!allowed.has(name)) extra.push(name);
  }
  return { values, missing, extra };
}

export function generateSecret(): string {
  return randomBytes(32).toString("base64url");
}

function atomicWrite(file: string, contents: string): void {
  const temporary = join(dirname(file), `.${process.pid}.${randomBytes(8).toString("hex")}.tmp`);
  const existingMode = existsSync(file) ? statSync(file).mode & 0o777 : 0o600;
  try {
    writeFileSync(temporary, contents, { encoding: "utf8", flag: "wx", mode: existingMode });
    renameSync(temporary, file);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // The temporary file was either never created or already moved.
    }
    throw error;
  }
}

function exampleKeys(example: string): Set<string> {
  const names = new Set<string>();
  for (const line of example.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (match?.[1]) names.add(match[1]);
  }
  return names;
}

function templateForRequiredSecrets(example: string, required: string[]): string {
  const requiredSet = new Set(required);
  const output: string[] = [];
  let pending: string[] = [];
  for (const line of example.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match) {
      pending.push(line);
      continue;
    }
    if (match?.[1] && requiredSet.has(match[1])) output.push(...pending, line);
    pending = [];
  }
  if (output.length === 0 && required.length > 0) {
    for (const name of required) output.push(`${name}=`);
  }
  return `${output.join("\n").trimEnd()}\n`;
}

function updateEnvValues(source: string, values: Map<string, string>): string {
  const lines = source.split(/\r?\n/);
  const found = new Set<string>();
  const updated = lines.map((line) => {
    const match = line.match(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match) return line;
    const prefix = match[1];
    const name = match[2];
    const separator = match[3];
    if (prefix === undefined || name === undefined || separator === undefined) return line;
    const value = values.get(name);
    if (value === undefined) return line;
    found.add(name);
    return `${prefix}${name}${separator}${value}`;
  });
  for (const [name, value] of values) {
    if (!found.has(name)) updated.push(`${name}=${value}`);
  }
  return `${updated.join("\n").trimEnd()}\n`;
}

export function initializeLocalSecrets(
  exampleFile: string,
  destinationFile: string,
  requiredNames: string[],
): { created: boolean; generated: string[]; missing: string[]; extra: string[] } {
  if (requiredNames.length === 0) {
    return { created: false, generated: [], missing: [], extra: [] };
  }
  if (!existsSync(exampleFile)) {
    throw new Error(`Missing ${exampleFile}; add committed secret names before running setup.`);
  }
  const example = readFileSync(exampleFile, "utf8");
  const absentFromExample = requiredNames.filter((name) => !exampleKeys(example).has(name));
  if (absentFromExample.length > 0) {
    throw new Error(
      `${exampleFile} must declare required secret(s): ${absentFromExample.join(", ")}.`,
    );
  }

  const created = !existsSync(destinationFile);
  const initial = created
    ? templateForRequiredSecrets(example, requiredNames)
    : readFileSync(destinationFile, "utf8");
  const currentValues = parseEnvText(initial, destinationFile);
  const updates = new Map<string, string>();
  const generated: string[] = [];
  for (const name of requiredNames) {
    if (currentValues.get(name)) continue;
    if (name === "BETTER_AUTH_SECRET") {
      updates.set(name, generateSecret());
      generated.push(name);
    } else if (!currentValues.has(name)) {
      updates.set(name, "");
    }
  }

  if (created || updates.size > 0) {
    atomicWrite(destinationFile, updateEnvValues(initial, updates));
  }
  const finalValues = readSecretFile(destinationFile, requiredNames);
  return { created, generated, missing: finalValues.missing, extra: finalValues.extra };
}

export function writeGeneratedSecret(file: string, name: string, value: string): void {
  const source = existsSync(file) ? readFileSync(file, "utf8") : "";
  const values = parseEnvText(source, file);
  if (values.get(name)) {
    throw new Error(`${name} already has a value in ${file}; refusing to overwrite it.`);
  }
  atomicWrite(file, updateEnvValues(source, new Map([[name, value]])));
}

export function validateGitignore(root: string): string[] {
  const file = join(root, ".gitignore");
  if (!existsSync(file)) return [".gitignore is missing; local secret files may be committed."];
  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim());
  const required = [".dev.vars", ".preview.vars"];
  return required
    .filter((pattern) => !lines.includes(pattern))
    .map((pattern) => `${pattern} is not ignored by .gitignore.`);
}
