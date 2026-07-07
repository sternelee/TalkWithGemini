import { describe, expect, it, vi } from "vitest";
import {
  ensureImageDisplayCache,
  getAttachmentSourceFingerprint,
  resolveAttachmentDisplayBlobUrl,
  stripAttachmentDisplayCacheForModel,
} from "../lib/utils/imageDisplayCache";
import type { Attachment } from "../types";

type SaveFileMock = (file: File, prefix?: string) => Promise<string>;

const imageAttachment = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: "img_1",
  mimeType: "image/png",
  data: "aGVsbG8=",
  fileName: "image.png",
  ...overrides,
});

describe("image display cache", () => {
  it("writes base64 images to OPFS and records a matching source fingerprint", async () => {
    const saveFile = vi.fn<SaveFileMock>(
      async () => "opfs://images/generated/cache.png",
    );
    const attachment = imageAttachment();

    const cached = await ensureImageDisplayCache(attachment, {
      saveFile,
      now: () => 123,
    });

    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(saveFile.mock.calls[0][0]).toMatchObject({
      name: "image.png",
      type: "image/png",
    });
    expect(saveFile.mock.calls[0][1]).toBe("images");
    expect(cached).toMatchObject({
      displayCache: {
        opfsUrl: "opfs://images/generated/cache.png",
        sourceKind: "data",
        sourceFingerprint: await getAttachmentSourceFingerprint(attachment),
        createdAt: 123,
      },
    });
    expect(cached.data).toBe(attachment.data);
  });

  it("reuses a fresh display cache and rebuilds a stale one", async () => {
    const original = imageAttachment();
    const fingerprint = await getAttachmentSourceFingerprint(original);
    expect(fingerprint).toBeTruthy();
    const saveFile = vi.fn<SaveFileMock>(
      async () => "opfs://images/generated/new.png",
    );

    const reused = await ensureImageDisplayCache(
      imageAttachment({
        displayCache: {
          opfsUrl: "opfs://images/generated/existing.png",
          sourceKind: "data",
          sourceFingerprint: fingerprint!,
          createdAt: 1,
        },
      }),
      { saveFile },
    );
    expect(reused.displayCache?.opfsUrl).toBe(
      "opfs://images/generated/existing.png",
    );
    expect(saveFile).not.toHaveBeenCalled();

    const rebuilt = await ensureImageDisplayCache(
      imageAttachment({
        data: "bmV3LWltYWdl",
        displayCache: {
          opfsUrl: "opfs://images/generated/stale.png",
          sourceKind: "data",
          sourceFingerprint: fingerprint!,
          createdAt: 1,
        },
      }),
      { saveFile },
    );
    expect(rebuilt.displayCache?.opfsUrl).toBe(
      "opfs://images/generated/new.png",
    );
    expect(saveFile).toHaveBeenCalledTimes(1);
  });

  it("resolves cached OPFS images to Blob URLs and falls back to base64 Blob URLs", async () => {
    const createObjectURL = vi
      .fn()
      .mockReturnValueOnce("blob:from-cache")
      .mockReturnValueOnce("blob:from-data");
    const resolveOPFSBlob = vi.fn(async () => new Blob(["cached"]));

    await expect(
      resolveAttachmentDisplayBlobUrl(
        imageAttachment({
          displayCache: {
            opfsUrl: "opfs://images/generated/cache.png",
            sourceKind: "data",
            sourceFingerprint: "fingerprint",
            createdAt: 1,
          },
        }),
        {
          resolveOPFSBlob,
          createObjectURL,
        },
      ),
    ).resolves.toBe("blob:from-cache");
    expect(resolveOPFSBlob).toHaveBeenCalledWith(
      "opfs://images/generated/cache.png",
    );

    await expect(
      resolveAttachmentDisplayBlobUrl(imageAttachment(), {
        resolveOPFSBlob,
        createObjectURL,
      }),
    ).resolves.toBe("blob:from-data");
  });

  it("strips display cache before model requests and converts legacy OPFS-only images to base64", async () => {
    const cached = imageAttachment({
      displayCache: {
        opfsUrl: "opfs://images/generated/cache.png",
        sourceKind: "data",
        sourceFingerprint: "fingerprint",
        createdAt: 1,
      },
    });

    expect(await stripAttachmentDisplayCacheForModel(cached)).toEqual({
      id: "img_1",
      mimeType: "image/png",
      data: "aGVsbG8=",
      fileName: "image.png",
    });

    const legacy = imageAttachment({
      data: undefined,
      url: "opfs://images/generated/legacy.png",
    });

    const converted = await stripAttachmentDisplayCacheForModel(legacy, {
      resolveOPFSBlob: async () => new Blob(["legacy"], { type: "image/png" }),
    });
    expect(converted).toMatchObject({ data: "bGVnYWN5" });
    expect(converted).not.toHaveProperty("url");
  });
});
