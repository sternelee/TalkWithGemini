import { describe, expect, it } from "vitest";
import { getSafeOPFSPath } from "../utils/opfs";

describe("OPFS URL path validation", () => {
  it("extracts safe relative OPFS paths", () => {
    expect(getSafeOPFSPath("opfs://chat/session/file.txt")).toBe(
      "chat/session/file.txt",
    );
  });

  it("rejects non-OPFS URLs", () => {
    expect(getSafeOPFSPath("https://example.com/file.txt")).toBeNull();
  });

  it("rejects empty, absolute, and traversal paths", () => {
    expect(getSafeOPFSPath("opfs://")).toBeNull();
    expect(getSafeOPFSPath("opfs:///absolute/file.txt")).toBeNull();
    expect(getSafeOPFSPath("opfs://chat/../secret.txt")).toBeNull();
    expect(getSafeOPFSPath("opfs://chat/./file.txt")).toBeNull();
    expect(getSafeOPFSPath("opfs://chat//file.txt")).toBeNull();
  });

  it("rejects backslashes and null bytes", () => {
    expect(getSafeOPFSPath("opfs://chat\\file.txt")).toBeNull();
    expect(getSafeOPFSPath("opfs://chat/file\u0000.txt")).toBeNull();
  });
});
