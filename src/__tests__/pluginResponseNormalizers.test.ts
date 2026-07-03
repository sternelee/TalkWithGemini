import { describe, expect, it } from "vitest";
import { normalizePluginResponse } from "../lib/plugin/responseNormalizers";
import type { Plugin } from "../types";

function plugin(id: string): Plugin {
  return {
    id,
    title: id,
    description: "",
    logoUrl: "",
    manifestUrl: "",
    functions: [],
  };
}

describe("plugin response normalizers", () => {
  it("extracts readable Jina markdown payloads", () => {
    expect(
      normalizePluginResponse(plugin("jina-web-reader"), {
        code: 200,
        data: { content: "# Example\n\nReadable markdown." },
      }),
    ).toBe("# Example\n\nReadable markdown.");
  });

  it("normalizes Agnes image responses", () => {
    const response = {
      data: [
        {
          url: "https://storage.example/image.png",
          b64_json: "base64",
          revised_prompt: "revised",
        },
      ],
    };

    expect(
      normalizePluginResponse(plugin("agnes-image-generation"), response),
    ).toEqual({
      imageUrl: "https://storage.example/image.png",
      imageBase64: "base64",
      revisedPrompt: "revised",
      raw: response,
    });
  });

  it("normalizes Agnes video status fields", () => {
    const response = {
      id: "task_1",
      video_id: "video_1",
      status: "failed",
      progress: 75,
      error: "Generation failed upstream",
    };

    expect(
      normalizePluginResponse(plugin("agnes-video-generation"), response),
    ).toEqual({
      taskId: "task_1",
      videoId: "video_1",
      status: "failed",
      generationStatus: "failed",
      progress: 75,
      seconds: null,
      size: null,
      videoUrl: null,
      error: "Generation failed upstream",
      raw: response,
    });
  });
});
