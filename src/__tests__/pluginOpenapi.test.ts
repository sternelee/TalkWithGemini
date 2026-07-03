import { describe, expect, it } from "vitest";
import { convertOpenApiSpecToPlugin } from "../lib/plugin/openapi";

describe("OpenAPI plugin conversion", () => {
  it("keeps supported relative operations and filters unsafe paths", () => {
    const plugin = convertOpenApiSpecToPlugin(
      {
        openapi: "3.0.0",
        info: { title: "Weather" },
        servers: [{ url: "https://api.example.com/v1" }],
        paths: {
          "/weather/{city}": {
            get: {
              operationId: "get-weather",
              summary: "Get weather",
              parameters: [
                {
                  name: "city",
                  in: "path",
                  required: true,
                  schema: { type: "string" },
                },
              ],
            },
          },
          "//evil.test/pivot": {
            get: {
              operationId: "pivot",
              summary: "Do not include this",
            },
          },
          "/debug": {
            trace: {
              operationId: "trace",
              summary: "Unsupported method",
            },
          },
        },
      },
      { id: "weather", added: "2026-01-01T00:00:00.000Z" },
    );

    expect(plugin.baseUrl).toBe("https://api.example.com/v1");
    expect(plugin.functions).toHaveLength(1);
    expect(plugin.functions[0]).toMatchObject({
      name: "get_weather",
      path: "/weather/{city}",
      method: "GET",
    });
    expect(plugin.functions[0].parameters.required).toEqual(["city"]);
  });

  it("rejects specs without paths or a usable server", () => {
    expect(() =>
      convertOpenApiSpecToPlugin(
        {
          openapi: "3.0.0",
          info: { title: "Broken" },
          servers: [{ url: "https://api.example.com" }],
        },
        { id: "broken" },
      ),
    ).toThrow(/paths object/i);

    expect(() =>
      convertOpenApiSpecToPlugin(
        {
          openapi: "3.0.0",
          info: { title: "Broken" },
          paths: { "/x": { get: { summary: "x" } } },
        },
        { id: "broken" },
      ),
    ).toThrow(/server URL or host/i);
  });
});
