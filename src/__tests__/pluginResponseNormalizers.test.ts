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

  it("normalizes Gemini interaction image responses", () => {
    const response = {
      id: "interaction_1",
      output_image: {
        data: "gemini-image",
        mime_type: "image/webp",
      },
    };

    expect(
      normalizePluginResponse(plugin("gemini-image-generation"), response),
    ).toEqual({
      imageUrl: null,
      imageBase64: "gemini-image",
      revisedPrompt: null,
      images: [
        {
          imageUrl: null,
          imageBase64: "gemini-image",
          mimeType: "image/webp",
        },
      ],
      raw: response,
    });
  });

  it("normalizes OpenAI Responses image generation calls", () => {
    const response = {
      output: [
        {
          type: "image_generation_call",
          id: "ig_1",
          result: "openai-image",
          revised_prompt: "A revised prompt",
        },
        {
          type: "image_generation_call",
          id: "ig_2",
          result: "openai-image-2",
          revised_prompt: "Another revised prompt",
        },
      ],
    };

    expect(
      normalizePluginResponse(
        plugin("openai-responses-image-processing"),
        response,
      ),
    ).toEqual({
      imageUrl: null,
      imageBase64: "openai-image",
      revisedPrompt: "A revised prompt",
      images: [
        {
          imageUrl: null,
          imageBase64: "openai-image",
          mimeType: "image/png",
          revisedPrompt: "A revised prompt",
        },
        {
          imageUrl: null,
          imageBase64: "openai-image-2",
          mimeType: "image/png",
          revisedPrompt: "Another revised prompt",
        },
      ],
      raw: response,
    });
  });

  it("normalizes OpenAI-compatible Images API responses", () => {
    const response = {
      data: [
        {
          url: "https://cdn.example.com/image.png",
          b64_json: null,
          revised_prompt: "compat revised",
        },
      ],
    };

    expect(
      normalizePluginResponse(plugin("openai-image-generation"), response),
    ).toEqual({
      imageUrl: "https://cdn.example.com/image.png",
      imageBase64: null,
      revisedPrompt: "compat revised",
      images: [
        {
          imageUrl: "https://cdn.example.com/image.png",
          imageBase64: null,
          mimeType: "image/png",
          revisedPrompt: "compat revised",
        },
      ],
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
