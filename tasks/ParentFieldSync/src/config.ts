import type { FieldMapping } from "./types";

function assertSafeReferenceName(referenceName: string, lineNumber: number): void {
  if (referenceName.length === 0) {
    throw new Error(`Field mapping line ${lineNumber} contains an empty field reference name.`);
  }

  if (/[,\r\n\0]/u.test(referenceName)) {
    throw new Error(
      `Field mapping line ${lineNumber} contains an invalid field reference name: '${referenceName}'.`
    );
  }
}

export function parseFieldMappings(input: string): FieldMapping[] {
  const mappings: FieldMapping[] = [];
  const targetNames = new Set<string>();

  for (const [index, rawLine] of input.split(/\r?\n/u).entries()) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    const source = (separatorIndex < 0 ? line : line.slice(0, separatorIndex)).trim();
    const target = (separatorIndex < 0 ? line : line.slice(separatorIndex + 1)).trim();
    const lineNumber = index + 1;

    if (separatorIndex >= 0 && line.indexOf("=", separatorIndex + 1) >= 0) {
      throw new Error(`Field mapping line ${lineNumber} contains more than one '=' separator.`);
    }

    assertSafeReferenceName(source, lineNumber);
    assertSafeReferenceName(target, lineNumber);

    const normalizedTarget = target.toLocaleLowerCase("en-US");
    if (targetNames.has(normalizedTarget)) {
      throw new Error(`Target field '${target}' is mapped more than once.`);
    }

    targetNames.add(normalizedTarget);
    mappings.push({ source, target });
  }

  if (mappings.length === 0) {
    throw new Error("At least one field mapping is required.");
  }

  return mappings;
}

