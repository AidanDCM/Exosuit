import { win32 } from "node:path";
import { z } from "zod";

export const fieldDirectorySchema = z.enum(["Inbox", "Workspace", "Downloads", "Outbox", "Quarantine"]);
export type FieldDirectory = z.infer<typeof fieldDirectorySchema>;

export const artifactTransferDirectionSchema = z.enum(["host_to_field", "field_to_host", "field_internal"]);
export type ArtifactTransferDirection = z.infer<typeof artifactTransferDirectionSchema>;

export const scopedFieldPathSchema = z.object({
  fieldRoot: z.string().min(3),
  directory: fieldDirectorySchema,
  relativePath: z.string().min(1).max(4_096),
  absolutePath: z.string().min(3),
  direction: artifactTransferDirectionSchema,
  reparseInspectionRequired: z.literal(true),
});
export type ScopedFieldPath = z.infer<typeof scopedFieldPathSchema>;

const reservedDeviceName = /^(con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const invalidWindowsCharacters = /[<>"|?*]/;

const directionRoots: Readonly<Record<ArtifactTransferDirection, readonly FieldDirectory[]>> = {
  host_to_field: ["Inbox", "Quarantine"],
  field_to_host: ["Outbox"],
  field_internal: ["Inbox", "Workspace", "Downloads", "Outbox", "Quarantine"],
};

export function resolveFieldArtifactPath(input: {
  fieldRoot: string;
  directory: FieldDirectory;
  relativePath: string;
  direction: ArtifactTransferDirection;
}): ScopedFieldPath {
  const directory = fieldDirectorySchema.parse(input.directory);
  const direction = artifactTransferDirectionSchema.parse(input.direction);
  const fieldRoot = validateRoot(input.fieldRoot);
  if (!directionRoots[direction].includes(directory)) {
    throw new Error(`${direction} transfer is not allowed through Field directory ${directory}.`);
  }
  const relativePath = validateRelativePath(input.relativePath);
  const directoryRoot = win32.resolve(fieldRoot, directory);
  const absolutePath = win32.resolve(directoryRoot, relativePath);
  assertInside(directoryRoot, absolutePath);
  return scopedFieldPathSchema.parse({
    fieldRoot,
    directory,
    relativePath: relativePath.replaceAll("/", "\\"),
    absolutePath,
    direction,
    reparseInspectionRequired: true,
  });
}

export function assertNoReparseTraversal(input: {
  scope: ScopedFieldPath;
  inspectedAncestors: Array<{ path: string; isReparsePoint: boolean }>;
}): void {
  const scope = scopedFieldPathSchema.parse(input.scope);
  const root = win32.resolve(scope.fieldRoot, scope.directory);
  const target = win32.resolve(scope.absolutePath);
  assertInside(root, target);
  for (const ancestor of input.inspectedAncestors) {
    const path = win32.resolve(ancestor.path);
    assertInside(root, path);
    if (ancestor.isReparsePoint) throw new Error(`Field artifact path crosses a reparse point: ${path}`);
  }
}

function validateRoot(value: string): string {
  if (value.includes("\0")) throw new Error("Field root contains a null byte.");
  const normalized = value.replaceAll("/", "\\");
  if (!win32.isAbsolute(normalized) || normalized.startsWith("\\\\")) {
    throw new Error("Field root must be an absolute local Windows path.");
  }
  const root = win32.resolve(normalized);
  const parsed = win32.parse(root);
  if (root.toLowerCase() === parsed.root.toLowerCase()) throw new Error("Field root cannot be an entire drive.");
  return root;
}

function validateRelativePath(value: string): string {
  if (!value.trim()) throw new Error("Field artifact path cannot be empty.");
  if (value.includes("\0")) throw new Error("Field artifact path contains a null byte.");
  const normalized = value.replaceAll("\\", "/");
  if (normalized.startsWith("/") || normalized.startsWith("//") || win32.isAbsolute(value)) {
    throw new Error("Field artifact path must be relative.");
  }
  if (/^[a-z]:/i.test(normalized) || normalized.includes(":")) {
    throw new Error("Drive paths and alternate data streams are forbidden.");
  }
  const segments = normalized.split("/");
  if (segments.some((segment) => segment === "..")) throw new Error("Field artifact path escapes its scope.");
  if (segments.some((segment) => segment === "" || segment === ".")) {
    throw new Error("Field artifact path contains an ambiguous segment.");
  }
  for (const segment of segments) {
    if (segment.endsWith(".") || segment.endsWith(" ")) {
      throw new Error("Windows trailing dots and spaces are forbidden in Field artifact paths.");
    }
    if (invalidWindowsCharacters.test(segment)) throw new Error("Field artifact path contains invalid Windows characters.");
    if (reservedDeviceName.test(segment)) throw new Error("Windows reserved device names are forbidden in Field artifact paths.");
  }
  return segments.join("/");
}

function assertInside(root: string, target: string): void {
  const relative = win32.relative(win32.resolve(root), win32.resolve(target));
  if (!relative || relative === ".") throw new Error("Field artifact path must identify a file below its directory root.");
  if (relative === ".." || relative.startsWith(`..${win32.sep}`) || win32.isAbsolute(relative)) {
    throw new Error("Field artifact path escapes its directory root.");
  }
}
