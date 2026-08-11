import { describe, expect, it } from "vitest";

import {
  MAXIMUM_ITEMS,
  MAXIMUM_ITEM_CHARACTERS,
  parseGuestExchangeItem,
  parseGuestExchangeItems,
} from "../src/fieldKvpExchangeParser.js";

function item(name: string, data: string): string {
  return `<INSTANCE CLASSNAME="Msvm_KvpExchangeDataItem">`
    + `<PROPERTY NAME="Name" TYPE="string"><VALUE>${name}</VALUE></PROPERTY>`
    + `<PROPERTY NAME="Data" TYPE="string"><VALUE>${data}</VALUE></PROPERTY>`
    + `<PROPERTY NAME="Source" TYPE="uint16"><VALUE>2</VALUE></PROPERTY>`
    + `</INSTANCE>`;
}

describe("guest exchange item parsing", () => {
  it("extracts a Field name and data", () => {
    const result = parseGuestExchangeItem(item("Exosuit.Field.Scene", "payload"));

    expect(result).toEqual({ status: "ok", name: "Exosuit.Field.Scene", data: "payload" });
  });

  it("ignores names outside the Field prefix", () => {
    expect(parseGuestExchangeItem(item("OSName", "Windows")).status).toBe("ignored");
    expect(parseGuestExchangeItem(item("Exosuit", "x")).status).toBe("ignored");
  });

  it("decodes the five predefined entities and nothing else", () => {
    const result = parseGuestExchangeItem(
      item("Exosuit.Field.Scene", "&lt;a&gt; &amp; &quot;b&quot; &apos;c&apos; &#65;"),
    );

    // &#65; is left alone: expanding numeric references is not needed here and every expansion
    // rule is another thing a hostile guest can aim at.
    expect(result.status === "ok" && result.data).toBe(`<a> & "b" 'c' &#65;`);
  });

  it("does not re-decode an already decoded value", () => {
    // "&amp;lt;" must decode to "&lt;" and stop, not to "<".
    const result = parseGuestExchangeItem(item("Exosuit.Field.Scene", "&amp;lt;"));

    expect(result.status === "ok" && result.data).toBe("&lt;");
  });

  it("rejects an item declaring a DOCTYPE", () => {
    const hostile = `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///c:/windows/win.ini">]>`
      + item("Exosuit.Field.Scene", "&xxe;");

    const result = parseGuestExchangeItem(hostile);

    // Presence alone is the finding; there is no legitimate reason for one to appear.
    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.reason).toContain("DOCTYPE");
  });

  it("rejects an item declaring an ENTITY without a DOCTYPE wrapper", () => {
    const result = parseGuestExchangeItem(`<!ENTITY x "y">${item("Exosuit.Field.Scene", "a")}`);

    expect(result.status).toBe("invalid");
  });

  it("rejects an oversized item", () => {
    const result = parseGuestExchangeItem(item("Exosuit.Field.Scene", "x".repeat(MAXIMUM_ITEM_CHARACTERS)));

    expect(result.status).toBe("invalid");
    expect(result.status === "invalid" && result.reason).toContain("exceeds");
  });

  it("rejects an item missing either property", () => {
    const noName = `<INSTANCE><PROPERTY NAME="Data"><VALUE>d</VALUE></PROPERTY></INSTANCE>`;
    const noData = `<INSTANCE><PROPERTY NAME="Name"><VALUE>Exosuit.Field.Scene</VALUE></PROPERTY></INSTANCE>`;

    expect(parseGuestExchangeItem(noName).status).toBe("invalid");
    expect(parseGuestExchangeItem(noData).status).toBe("invalid");
  });

  it("accepts an empty data value", () => {
    const result = parseGuestExchangeItem(item("Exosuit.Field.Scene", ""));

    // Emptiness is the reader's business, not the parser's.
    expect(result).toEqual({ status: "ok", name: "Exosuit.Field.Scene", data: "" });
  });
});

describe("guest exchange snapshot parsing", () => {
  it("builds a snapshot from several Field items", () => {
    const result = parseGuestExchangeItems([
      item("Exosuit.Field.Heartbeat", "hb"),
      item("OSName", "Windows"),
      item("Exosuit.Field.Scene", "scene"),
    ]);

    expect(result.snapshot).toEqual({
      "Exosuit.Field.Heartbeat": "hb",
      "Exosuit.Field.Scene": "scene",
    });
    expect(result.failures).toEqual([]);
  });

  it("preserves chunk keys so reassembly can find them", () => {
    const result = parseGuestExchangeItems([
      item("Exosuit.Field.Scene", JSON.stringify({ transport: "chunked" })),
      item("Exosuit.Field.Scene.000", "part-0"),
      item("Exosuit.Field.Scene.001", "part-1"),
    ]);

    expect(Object.keys(result.snapshot)).toContain("Exosuit.Field.Scene.001");
  });

  it("fails a duplicate name rather than letting the last one win", () => {
    const result = parseGuestExchangeItems([
      item("Exosuit.Field.Scene", "first"),
      item("Exosuit.Field.Scene", "second"),
    ]);

    // Two values for one key means the snapshot is ambiguous; picking one would hand the reader
    // a value it cannot attribute.
    expect(result.snapshot["Exosuit.Field.Scene"]).toBe("first");
    expect(result.failures.join(" ")).toContain("duplicate");
  });

  it("reports each invalid item with its index rather than dropping it silently", () => {
    const result = parseGuestExchangeItems([
      item("Exosuit.Field.Scene", "ok"),
      "<INSTANCE>garbage</INSTANCE>",
    ]);

    expect(result.snapshot["Exosuit.Field.Scene"]).toBe("ok");
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toContain("item 1");
  });

  it("refuses an exchange with an implausible number of items", () => {
    const many = Array.from({ length: MAXIMUM_ITEMS + 1 }, (_, index) =>
      item(`Exosuit.Field.Scene.${index}`, "x"));

    const result = parseGuestExchangeItems(many);

    expect(result.snapshot).toEqual({});
    expect(result.failures.join(" ")).toContain("above the");
  });

  it("returns an empty snapshot rather than throwing on an empty exchange", () => {
    expect(parseGuestExchangeItems([])).toEqual({ snapshot: {}, failures: [] });
  });
});
