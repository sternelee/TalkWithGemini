import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchTextMock = vi.hoisted(() => vi.fn());
const decryptOptionalSecretMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);

vi.mock("@/lib/api/schemas", async () => vi.importActual("../lib/api/schemas"));

vi.mock("@/lib/byok/shared", async () => vi.importActual("../lib/byok/shared"));

vi.mock("@/lib/plugin/manifest", async () =>
  vi.importActual("../lib/plugin/manifest"),
);

vi.mock("@/lib/plugin/config", async () =>
  vi.importActual("../lib/plugin/config"),
);

vi.mock("@/lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);

vi.mock("@/lib/security/deployment", async () =>
  vi.importActual("../lib/security/deployment"),
);

vi.mock("@/lib/utils/safeServerLog", async () =>
  vi.importActual("../lib/utils/safeServerLog"),
);

vi.mock("@/lib/security/safeFetch", () => ({
  safeFetchText: safeFetchTextMock,
}));

vi.mock("@/lib/byok/server", () => ({
  decryptOptionalSecret: decryptOptionalSecretMock,
}));

const secret = {
  v: 1,
  kid: "kid",
  alg: "RSA-OAEP-256+A256GCM",
  iv: "iv",
  wrappedKey: "wrapped",
  ciphertext: "ciphertext",
  context: "plugin:test-plugin:auth",
} as const;

function createRequest(body: unknown) {
  return new Request("http://localhost/api/plugins/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("plugin execute route", () => {
  beforeEach(() => {
    safeFetchTextMock.mockReset();
    decryptOptionalSecretMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects unresolved path parameters before outbound fetch", async () => {
    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        plugin: {
          id: "test-plugin",
          baseUrl: "https://api.example.com",
          functions: [{ name: "lookup", path: "/items/{id}", method: "GET" }],
        },
        functionDef: { name: "lookup", path: "/items/{id}", method: "GET" },
        args: {},
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Plugin path parameters are missing",
    });
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });

  it("rejects legacy plugin payloads in hosted mode", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        plugin: {
          id: "test-plugin",
          baseUrl: "https://api.example.com",
          functions: [{ name: "lookup", path: "/items/{id}", method: "GET" }],
        },
        functionDef: { name: "lookup", path: "/items/{id}", method: "GET" },
        args: { id: "abc" },
      }) as any,
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: "Legacy plugin execution payloads are disabled in hosted mode",
    });
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });

  it("adds API key auth to query parameters and keeps response size capped", async () => {
    decryptOptionalSecretMock.mockResolvedValue("secret-value");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({ ok: true }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        plugin: {
          id: "test-plugin",
          baseUrl: "https://api.example.com",
          auth: { type: "apiKey", name: "token", in: "query" },
          functions: [{ name: "lookup", path: "/items/{id}", method: "GET" }],
        },
        functionDef: { name: "lookup", path: "/items/{id}", method: "GET" },
        args: { id: "abc", q: "neo" },
        authConfig: {
          type: "apiKey",
          addTo: "query",
          key: "token",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://api.example.com/items/abc?q=neo&token=secret-value",
      expect.objectContaining({ method: "GET" }),
      expect.objectContaining({ maxResponseBytes: 2 * 1024 * 1024 }),
    );
  });

  it("executes registered plugin functions with the new id/name payload", async () => {
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({ temp: 21 }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "weather-gpt",
        functionName: "getCurrentWeather",
        args: { location: "Shanghai" },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://weathergpt.vercel.app/api/weather?location=Shanghai",
      expect.objectContaining({ method: "GET" }),
      expect.any(Object),
    );
  });

  it("injects optional Jina reader bearer auth and normalizes markdown content", async () => {
    decryptOptionalSecretMock.mockResolvedValue("jina-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        code: 200,
        data: { content: "# Example\n\nReadable markdown." },
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "jina-web-reader",
        functionName: "read_webpage",
        args: { url: "https://example.com/doc" },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://r.jina.ai/https%3A%2F%2Fexample.com%2Fdoc",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer jina-secret",
        }),
      }),
      expect.any(Object),
    );
    expect(await response.json()).toEqual({
      result: "# Example\n\nReadable markdown.",
    });
  });

  it("normalizes Agnes image generation results", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        created: 1780000000,
        data: [
          {
            url: "https://storage.example/image.png",
            b64_json: null,
            revised_prompt: null,
          },
        ],
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-image-generation",
        functionName: "generate_image",
        args: {
          prompt: "A compact glass cube",
          size: "1024x768",
        },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer agnes-secret",
        }),
      }),
      expect.any(Object),
    );
    expect(
      JSON.parse(safeFetchTextMock.mock.calls.at(-1)?.[1]?.body as string),
    ).toEqual({
      model: "agnes-image-2.1-flash",
      prompt: "A compact glass cube",
      size: "1024x768",
    });
    expect(await response.json()).toEqual({
      result: {
        imageUrl: "https://storage.example/image.png",
        imageBase64: null,
        revisedPrompt: null,
        raw: {
          created: 1780000000,
          data: [
            {
              url: "https://storage.example/image.png",
              b64_json: null,
              revised_prompt: null,
            },
          ],
        },
      },
    });
  });

  it("normalizes Agnes video task result fields", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        id: "task_1",
        task_id: "task_1",
        video_id: "video_1",
        status: "completed",
        progress: 100,
        seconds: "5.0",
        size: "1152x768",
        remixed_from_video_id: "https://storage.example/video.mp4",
        error: null,
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "get_video_result",
        args: { video_id: "video_1" },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/agnesapi?video_id=video_1",
      expect.objectContaining({ method: "GET" }),
      expect.any(Object),
    );
    expect(await response.json()).toEqual({
      result: {
        taskId: "task_1",
        videoId: "video_1",
        status: "completed",
        generationStatus: "generated",
        progress: 100,
        seconds: "5.0",
        size: "1152x768",
        videoUrl: "https://storage.example/video.mp4",
        error: null,
        raw: {
          id: "task_1",
          task_id: "task_1",
          video_id: "video_1",
          status: "completed",
          progress: 100,
          seconds: "5.0",
          size: "1152x768",
          remixed_from_video_id: "https://storage.example/video.mp4",
          error: null,
        },
      },
    });
  });

  it("normalizes Agnes video tasks that are still generating", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        id: "task_2",
        video_id: "video_2",
        status: "in_progress",
        progress: 42,
        error: null,
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "get_video_result",
        args: { video_id: "video_2" },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: {
        taskId: "task_2",
        videoId: "video_2",
        status: "in_progress",
        generationStatus: "generating",
        progress: 42,
        videoUrl: null,
        error: null,
      },
    });
  });

  it("normalizes failed Agnes video tasks without turning them into transport errors", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        id: "task_3",
        video_id: "video_3",
        status: "failed",
        progress: 75,
        error: "Generation failed upstream",
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "get_video_result",
        args: { video_id: "video_3" },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: {
        taskId: "task_3",
        videoId: "video_3",
        status: "failed",
        generationStatus: "failed",
        error: "Generation failed upstream",
      },
    });
  });

  it("retrieves legacy Agnes video results by task id", async () => {
    decryptOptionalSecretMock.mockResolvedValue("agnes-secret");
    safeFetchTextMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      text: JSON.stringify({
        id: "task_legacy",
        status: "queued",
        progress: 0,
        error: null,
      }),
    });

    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "get_video_result",
        args: { task_id: "task_legacy" },
        authConfig: {
          type: "bearer",
          valueSecret: secret,
        },
      }) as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchTextMock).toHaveBeenCalledWith(
      "https://apihub.agnes-ai.com/v1/videos/task_legacy",
      expect.objectContaining({ method: "GET" }),
      expect.any(Object),
    );
    expect(await response.json()).toMatchObject({
      result: {
        taskId: "task_legacy",
        status: "queued",
        generationStatus: "generating",
      },
    });
  });

  it("rejects Agnes video result lookups without a video id or task id", async () => {
    const { POST } = await import("../app/api/plugins/execute/route");
    const response = await POST(
      createRequest({
        pluginId: "agnes-video-generation",
        functionName: "get_video_result",
        args: {},
      }) as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: "Agnes video result lookup requires video_id or task_id",
    });
    expect(safeFetchTextMock).not.toHaveBeenCalled();
  });
});
