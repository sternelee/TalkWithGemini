import { describe, expect, it } from "vitest";
import {
  APP_EXPORT_VERSION,
  collectOrphanOpfsUrls,
  collectReferencedOpfsUrls,
  createAppExportPayload,
} from "../lib/data/appExport";
import { STORAGE_VERSION } from "../store/storage/storageConfig";

describe("app export helpers", () => {
  it("creates a versioned local-first export payload", () => {
    const payload = createAppExportPayload({
      exportedAt: "2026-07-01T00:00:00.000Z",
      coreSettings: { theme: "dark" },
      settings: { activePlugins: ["weather"] },
      chat: { sessions: [{ id: "s1", title: "Chat" }] },
      knowledge: { collections: [] },
      memory: { memories: [{ id: "mem-1" }] },
    });

    expect(payload).toEqual({
      exportVersion: APP_EXPORT_VERSION,
      storageVersion: STORAGE_VERSION,
      exportedAt: "2026-07-01T00:00:00.000Z",
      data: {
        coreSettings: { theme: "dark" },
        settings: { activePlugins: ["weather"] },
        chat: { sessions: [{ id: "s1", title: "Chat" }] },
        knowledge: { collections: [] },
        memory: { memories: [{ id: "mem-1" }] },
      },
    });
  });

  it("collects referenced OPFS URLs and identifies app-owned orphans", () => {
    const referenced = collectReferencedOpfsUrls({
      chat: {
        workspaces: [
          {
            files: [
              { url: "opfs://workspaces/w1/preset.txt" },
              { url: "https://example.com/remote.txt" },
            ],
          },
        ],
        sessions: [
          {
            messages: [
              {
                attachments: [
                  {
                    url: "opfs://chat/s1/attachment.txt",
                    displayCache: {
                      opfsUrl: "opfs://images/generated/display-cache.png",
                    },
                  },
                ],
                outputBlocks: [
                  {
                    type: "image",
                    image: {
                      displayCache: {
                        opfsUrl: "opfs://images/generated/output-block.png",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      knowledge: {
        collections: [
          {
            files: [{ path: "opfs://knowledge-base/c1/local.md" }],
          },
        ],
      },
    });

    expect([...referenced].sort()).toEqual([
      "opfs://chat/s1/attachment.txt",
      "opfs://images/generated/display-cache.png",
      "opfs://images/generated/output-block.png",
      "opfs://knowledge-base/c1/local.md",
      "opfs://workspaces/w1/preset.txt",
    ]);
    expect(
      collectOrphanOpfsUrls({
        existingUrls: [
          "opfs://chat/s1/attachment.txt",
          "opfs://chat/s1/orphan.txt",
          "opfs://external/outside.txt",
        ],
        referencedUrls: referenced,
      }),
    ).toEqual(["opfs://chat/s1/orphan.txt"]);
  });
});
