import { NextRequest, NextResponse } from "next/server";
import { v7 as uuidv7 } from "uuid";
import {
  assertProviderOutboundAllowed,
  createGeminiClient,
} from "@/utils/apiHelpers";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { ImageGenerateRequestSchema } from "@/lib/api/schemas";
import { safeFetchJson } from "@/lib/security/safeFetch";
import {
  getProviderApiKey,
  getSafeUrlPolicy,
  normalizeProviderBaseUrl,
} from "@/lib/security/urlPolicy";
import { resolveProviderRuntimeConfig } from "@/lib/byok/server";
import { normalizeGeneratedImageAttachments } from "@/lib/utils/generatedImages";
import { safeServerLogError } from "@/lib/utils/safeServerLog";
import { isOpenAIProviderType } from "@/lib/providers/providerTypes";
import type { Attachment } from "@/types";

function base64ToBlob(data: string, mimeType: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function appendOpenAIEditImages(formData: FormData, attachments: Attachment[]) {
  const images = attachments.filter((attachment) =>
    attachment.mimeType.toLowerCase().startsWith("image/"),
  );
  if (images.length === 0) return false;

  for (const [index, attachment] of images.entries()) {
    if (!attachment.data) {
      throw new Error(
        "Image editing requires uploaded image attachments with inline data.",
      );
    }
    formData.append(
      "image",
      base64ToBlob(attachment.data, attachment.mimeType),
      attachment.fileName || `edit-source-${index + 1}.png`,
    );
  }

  return true;
}

function attachmentsToGeminiParts(attachments: Attachment[] = []): any[] {
  return attachments
    .map((attachment) => {
      if (attachment.url && !attachment.data) {
        return {
          fileData: {
            mimeType: attachment.mimeType,
            fileUri: attachment.url,
          },
        };
      }
      if (attachment.data) {
        return {
          inlineData: {
            mimeType: attachment.mimeType,
            data: attachment.data,
          },
        };
      }
      return null;
    })
    .filter(Boolean) as any[];
}

export async function POST(request: NextRequest) {
  try {
    const body = ImageGenerateRequestSchema.parse(
      await readJsonRequestBody(request),
    );
    const { modelName, prompt, imageCount, attachments } = body;
    const provider = await resolveProviderRuntimeConfig(body.provider);

    if (isOpenAIProviderType(provider.type)) {
      const apiKey = getProviderApiKey(provider);
      if (!apiKey) {
        return NextResponse.json(
          { error: "OpenAI API key is not configured" },
          { status: 401 },
        );
      }
      const baseUrl = normalizeProviderBaseUrl(provider.baseUrl, "OpenAI");
      const isEditRequest = Boolean(attachments?.length);
      const url = `${baseUrl}/images/${isEditRequest ? "edits" : "generations"}`;
      const requestOptions = {
        policy: getSafeUrlPolicy("provider"),
        timeoutMs: 60_000,
        maxResponseBytes: 20 * 1024 * 1024,
      };

      const { response, data } = isEditRequest
        ? await (async () => {
            const formData = new FormData();
            formData.append("model", modelName);
            formData.append("prompt", prompt);
            if (imageCount) formData.append("n", String(imageCount));
            formData.append("size", "1024x1024");
            formData.append("response_format", "b64_json");
            if (!appendOpenAIEditImages(formData, attachments || [])) {
              throw new Error("Image editing requires at least one image.");
            }
            return safeFetchJson<any>(
              url,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                },
                body: formData,
              },
              requestOptions,
            );
          })()
        : await safeFetchJson<any>(
            url,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: modelName,
                prompt: prompt,
                ...(imageCount ? { n: imageCount } : {}),
                size: "1024x1024",
                response_format: "b64_json",
              }),
            },
            requestOptions,
          );

      if (!response.ok) {
        throw new Error(
          `OpenAI Image Error: ${data.error?.message || response.statusText}`,
        );
      }

      if (data.data && data.data.length > 0) {
        const images = normalizeGeneratedImageAttachments(
          data.data.map((item: any) => ({
            id: uuidv7(),
            mimeType: "image/png",
            data: item.b64_json,
            fileName: `generated-${Date.now()}.png`,
          })),
        );

        if (images.length > 0) {
          return NextResponse.json({
            images,
            message: `${isEditRequest ? "Edited" : "Generated"} ${images.length} image(s) for prompt: "${prompt}"`,
          });
        }
      }

      return NextResponse.json({
        images: [],
        message: "No images generated.",
      });
    } else {
      // Gemini
      await assertProviderOutboundAllowed(provider);
      const ai = createGeminiClient(provider);

      if (attachments?.length) {
        const response: any = await ai.models.generateContent({
          model: modelName,
          contents: {
            parts: [{ text: prompt }, ...attachmentsToGeminiParts(attachments)],
          },
          config: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        });
        const parts = response.candidates?.[0]?.content?.parts || [];
        const images = normalizeGeneratedImageAttachments(
          parts
            .filter((part: any) => part.inlineData)
            .map((part: any) => ({
              id: uuidv7(),
              mimeType: part.inlineData.mimeType || "image/png",
              data: part.inlineData.data,
              fileName: `gemini-edit-${Date.now()}.png`,
            })),
        );
        const text = parts
          .map((part: any) => (typeof part.text === "string" ? part.text : ""))
          .join("")
          .trim();

        if (images.length > 0) {
          return NextResponse.json({
            images,
            message: text || `Generated image for: "${prompt}"`,
          });
        }

        return NextResponse.json({
          images: [],
          message: text || "No images generated.",
        });
      }

      const response: any = await ai.models.generateImages({
        model: modelName,
        prompt: prompt,
        config: {
          ...(imageCount ? { numberOfImages: imageCount } : {}),
          aspectRatio: "1:1",
        },
      });

      if (response.generatedImages && response.generatedImages.length > 0) {
        const images = normalizeGeneratedImageAttachments(
          response.generatedImages.map((img: any) => ({
            id: uuidv7(),
            mimeType: img.image?.mimeType || "image/png",
            data: img.image?.imageBytes,
            fileName: `imagen-${Date.now()}.png`,
          })),
        );

        if (images.length > 0) {
          return NextResponse.json({
            images,
            message: `Generated image for: "${prompt}"`,
          });
        }
      }

      return NextResponse.json({
        images: [],
        message: "No images generated.",
      });
    }
  } catch (error: any) {
    safeServerLogError("Image generation error:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return createApiErrorResponse(error, "Invalid image generation request");
    }
    return createApiErrorResponse(error, "Image generation failed");
  }
}
