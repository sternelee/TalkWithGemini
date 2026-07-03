import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertProviderOutboundAllowed,
  createOpenAIClient,
  createGeminiClient,
} from "@/utils/apiHelpers";
import {
  ModelNameSchema,
  ProviderRuntimeConfigSchema,
} from "@/lib/api/schemas";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { resolveProviderRuntimeConfig } from "@/lib/byok/server";
import { isOpenAIProviderType } from "@/lib/providers/providerTypes";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

const ExecuteCodeSchema = z.object({
  provider: ProviderRuntimeConfigSchema,
  modelName: ModelNameSchema,
  code: z.string().min(1).max(100_000),
});

export async function POST(request: NextRequest) {
  try {
    const body = ExecuteCodeSchema.parse(await readJsonRequestBody(request));
    const { modelName, code } = body;
    const provider = await resolveProviderRuntimeConfig(body.provider);
    await assertProviderOutboundAllowed(provider);

    const prompt = `Please simulate the following Python code and return the likely output.
    
\`\`\`python
${code}
\`\`\`
`;

    if (isOpenAIProviderType(provider.type)) {
      const openai = createOpenAIClient(provider);

      const response = await openai.chat.completions.create({
        model: modelName,
        messages: [
          {
            role: "system",
            content:
              "You explain and simulate Python code. You do not have a real execution sandbox. Provide ONLY the likely output, and mention uncertainty only if the result depends on external state.",
          },
          { role: "user", content: prompt },
        ],
      });

      return NextResponse.json({
        output: response.choices[0].message.content || "No output returned.",
      });
    } else {
      // Gemini
      const ai = createGeminiClient(provider);

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          tools: [{ codeExecution: {} }],
        },
      });

      const candidates = response.candidates;
      if (
        candidates &&
        candidates.length > 0 &&
        candidates[0].content &&
        candidates[0].content.parts
      ) {
        const parts = candidates[0].content.parts;
        let output = "";
        let hasExecutionResult = false;

        for (const part of parts) {
          if (part.text) {
            if (!part.text.trim().startsWith("```python")) {
              output += part.text + "\n";
            }
          }

          if (part.codeExecutionResult) {
            hasExecutionResult = true;
            const resultOutput = part.codeExecutionResult.output;
            if (resultOutput) {
              output += resultOutput;
            }
          }
        }

        if (hasExecutionResult) {
          return NextResponse.json({ output: output.trim() });
        }
        return NextResponse.json({
          output: output.trim() || "No output generated.",
        });
      }

      return NextResponse.json({ output: response.text || "No output." });
    }
  } catch (error: any) {
    safeServerLogError("Code execution error:", error);
    if (error instanceof Error && error.name === "ZodError") {
      return createApiErrorResponse(error, "Invalid code execution request");
    }
    return createApiErrorResponse(error, "Code execution failed");
  }
}
