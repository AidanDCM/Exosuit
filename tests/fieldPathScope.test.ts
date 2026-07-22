import { describe, expect, it } from "vitest";
import { assertNoReparseTraversal, resolveFieldArtifactPath } from "../src/fieldPathScope.js";

describe("Field artifact path scope", () => {
  it("resolves approved transfer directions beneath fixed Field roots", () => {
    expect(
      resolveFieldArtifactPath({
        fieldRoot: "C:\\Field",
        directory: "Inbox",
        relativePath: "tasks\\request.json",
        direction: "host_to_field",
      }),
    ).toMatchObject({
      fieldRoot: "C:\\Field",
      directory: "Inbox",
      relativePath: "tasks\\request.json",
      absolutePath: "C:\\Field\\Inbox\\tasks\\request.json",
      reparseInspectionRequired: true,
    });
    expect(
      resolveFieldArtifactPath({
        fieldRoot: "C:\\Field",
        directory: "Outbox",
        relativePath: "reports/final.pdf",
        direction: "field_to_host",
      }).absolutePath,
    ).toBe("C:\\Field\\Outbox\\reports\\final.pdf");
  });

  it("enforces transfer direction instead of treating all folders alike", () => {
    expect(() =>
      resolveFieldArtifactPath({
        fieldRoot: "C:\\Field",
        directory: "Workspace",
        relativePath: "private.txt",
        direction: "field_to_host",
      }),
    ).toThrow(/not allowed/);
    expect(() =>
      resolveFieldArtifactPath({
        fieldRoot: "C:\\Field",
        directory: "Outbox",
        relativePath: "incoming.txt",
        direction: "host_to_field",
      }),
    ).toThrow(/not allowed/);
  });

  it.each([
    "..\\host.txt",
    "folder/../host.txt",
    "C:\\Windows\\secret.txt",
    "\\\\server\\share\\file.txt",
    "file.txt:stream",
    "CON",
    "aux.txt",
    "folder./file.txt",
    "folder /file.txt",
    "folder//file.txt",
    "./file.txt",
    "bad?.txt",
    "bad|name.txt",
    "\0hidden.txt",
  ])("rejects unsafe Windows path %s", (relativePath) => {
    expect(() =>
      resolveFieldArtifactPath({
        fieldRoot: "C:\\Field",
        directory: "Workspace",
        relativePath,
        direction: "field_internal",
      }),
    ).toThrow();
  });

  it("rejects drive-root and UNC Field roots", () => {
    expect(() =>
      resolveFieldArtifactPath({
        fieldRoot: "C:\\",
        directory: "Workspace",
        relativePath: "file.txt",
        direction: "field_internal",
      }),
    ).toThrow(/entire drive/);
    expect(() =>
      resolveFieldArtifactPath({
        fieldRoot: "\\\\server\\share\\Field",
        directory: "Workspace",
        relativePath: "file.txt",
        direction: "field_internal",
      }),
    ).toThrow(/local Windows path/);
  });

  it("requires the eventual file broker to inspect every ancestor for reparse points", () => {
    const scope = resolveFieldArtifactPath({
      fieldRoot: "C:\\Field",
      directory: "Outbox",
      relativePath: "reports\\final.pdf",
      direction: "field_to_host",
    });
    expect(() =>
      assertNoReparseTraversal({
        scope,
        inspectedAncestors: [
          { path: "C:\\Field\\Outbox\\reports", isReparsePoint: false },
          { path: "C:\\Field\\Outbox\\reports\\final.pdf", isReparsePoint: false },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      assertNoReparseTraversal({
        scope,
        inspectedAncestors: [{ path: "C:\\Field\\Outbox\\reports", isReparsePoint: true }],
      }),
    ).toThrow(/reparse point/);
    expect(() =>
      assertNoReparseTraversal({
        scope,
        inspectedAncestors: [{ path: "C:\\Windows", isReparsePoint: false }],
      }),
    ).toThrow(/escapes/);
  });
});
