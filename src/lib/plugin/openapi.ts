import { getSafeUrlPolicy, validateOutboundUrl } from "../security/urlPolicy";

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);
const MAX_OPENAPI_PATHS = 200;
const MAX_PARAMETERS_PER_FUNCTION = 50;
const MAX_PLUGIN_FUNCTIONS = 20;

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function mapOpenApiType(type: unknown): string {
  switch (type) {
    case "string":
    case "number":
    case "integer":
    case "boolean":
    case "array":
    case "object":
      return type;
    default:
      return "string";
  }
}

function sanitizeFunctionName(value: string, fallback: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 128);
  const named = cleaned || fallback;
  return /^[0-9]/.test(named) ? `fn_${named}` : named;
}

function normalizeOpenApiPath(path: string): string | null {
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  return path.slice(0, 1_024);
}

function getBaseUrl(spec: Record<string, any>, manifestUrl?: string): string {
  const servers = Array.isArray(spec.servers) ? spec.servers : [];
  const serverUrl = servers
    .map((server) => (isRecord(server) ? readString(server.url) : undefined))
    .find(Boolean);

  if (serverUrl) {
    const normalized = serverUrl.replace(/\{[^}]+\}/g, "").trim();
    return manifestUrl
      ? new URL(normalized, manifestUrl).toString()
      : normalized;
  }

  const host = readString(spec.host);
  if (host) {
    const schemes = Array.isArray(spec.schemes) ? spec.schemes : [];
    const scheme = schemes.includes("http") ? "http" : "https";
    return `${scheme}://${host}${readString(spec.basePath) || ""}`;
  }

  throw new Error("OpenAPI spec must define a server URL or host");
}

function assertOpenApiSpec(spec: unknown): asserts spec is Record<string, any> {
  if (!isRecord(spec)) {
    throw new Error("OpenAPI spec must be a JSON object");
  }

  if (!isRecord(spec.paths)) {
    throw new Error("OpenAPI spec must include a paths object");
  }
}

export function convertOpenApiSpecToPlugin(
  spec: unknown,
  basePlugin: Record<string, any>,
  manifestUrl?: string,
): Record<string, any> {
  assertOpenApiSpec(spec);

  const baseUrl = getBaseUrl(spec, manifestUrl);
  validateOutboundUrl(baseUrl, getSafeUrlPolicy("plugin"));

  let authInfo: any = undefined;
  const securitySchemes = isRecord(spec.components)
    ? spec.components.securitySchemes
    : spec.securityDefinitions;

  if (isRecord(securitySchemes)) {
    const firstScheme = Object.values(securitySchemes).find(isRecord);
    if (firstScheme?.type === "apiKey") {
      authInfo = {
        type: "apiKey",
        name: readString(firstScheme.name),
        in: readString(firstScheme.in),
      };
    } else if (
      firstScheme?.type === "http" &&
      firstScheme.scheme === "bearer"
    ) {
      authInfo = { type: "bearer" };
    } else if (firstScheme?.type === "oauth2") {
      authInfo = { type: "bearer" };
    }
  }

  const functions: any[] = [];
  const pathEntries = Object.entries(spec.paths).slice(0, MAX_OPENAPI_PATHS);

  for (const [rawPath, rawMethods] of pathEntries) {
    const path = normalizeOpenApiPath(rawPath);
    if (!path || !isRecord(rawMethods)) continue;

    for (const [rawMethod, rawOperation] of Object.entries(rawMethods)) {
      const method = rawMethod.toLowerCase();
      if (!HTTP_METHODS.has(method) || !isRecord(rawOperation)) continue;

      const operationId = readString(rawOperation.operationId);
      const fallbackName = `fn_${method}_${functions.length + 1}`;
      const functionName = sanitizeFunctionName(
        operationId || `${method}${path}`,
        fallbackName,
      );
      const description = (
        readString(rawOperation.summary) ||
        readString(rawOperation.description) ||
        ""
      ).slice(0, 1024);

      if (!description) continue;

      const properties: Record<string, any> = {};
      const requiredParams: string[] = [];
      const parameters = Array.isArray(rawOperation.parameters)
        ? rawOperation.parameters.slice(0, MAX_PARAMETERS_PER_FUNCTION)
        : [];

      for (const param of parameters) {
        if (!isRecord(param) || (param.in !== "path" && param.in !== "query")) {
          continue;
        }

        const paramName = readString(param.name);
        if (!paramName) continue;

        const cleanParamName = paramName.replace(/[^a-zA-Z0-9_]/g, "_");
        if (!cleanParamName) continue;

        const schema = isRecord(param.schema) ? param.schema : undefined;
        properties[cleanParamName] = {
          type: mapOpenApiType(schema?.type || param.type),
          description: readString(param.description) || paramName,
        };

        if (param.required) {
          requiredParams.push(cleanParamName);
        }
      }

      functions.push({
        name: functionName,
        description,
        parameters: {
          type: "object",
          properties,
          required: requiredParams.length > 0 ? requiredParams : undefined,
        },
        path,
        method: method.toUpperCase(),
      });

      if (functions.length >= MAX_PLUGIN_FUNCTIONS) break;
    }

    if (functions.length >= MAX_PLUGIN_FUNCTIONS) break;
  }

  if (functions.length === 0) {
    throw new Error("OpenAPI spec does not expose any supported operations");
  }

  const info = isRecord(spec.info) ? spec.info : {};

  return {
    id: basePlugin.id,
    title: basePlugin.title || readString(info.title) || "Unknown Plugin",
    description: basePlugin.description || readString(info.description) || "",
    logoUrl: basePlugin.logoUrl || "",
    manifestUrl: basePlugin.manifestUrl || "",
    externalDocsUrl: basePlugin.externalDocsUrl,
    category: basePlugin.category,
    categories: basePlugin.categories,
    added: basePlugin.added,
    baseUrl,
    functions,
    auth: authInfo,
  };
}
