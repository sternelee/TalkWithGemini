import { describe, expect, it } from "vitest";
import { getOPFSReconciliationPlan, toOPFSUrl } from "../utils/opfsReconcile";

describe("OPFS reconciliation planning", () => {
  it("finds missing metadata files and orphan OPFS files", () => {
    const plan = getOPFSReconciliationPlan({
      expectedUrls: [
        "opfs://knowledge-base/a/kept.txt",
        "opfs://knowledge-base/a/missing.txt",
        "https://example.com/remote.txt",
      ],
      actualPaths: ["knowledge-base/a/kept.txt", "knowledge-base/a/orphan.txt"],
    });

    expect(plan.missingUrls).toEqual(["opfs://knowledge-base/a/missing.txt"]);
    expect(plan.orphanUrls).toEqual(["opfs://knowledge-base/a/orphan.txt"]);
    expect(toOPFSUrl("knowledge-base/a/orphan.txt")).toBe(
      "opfs://knowledge-base/a/orphan.txt",
    );
  });
});
