import { createApiErrorResponse } from "@/lib/api/middleware";
import { getByokPublicKey } from "@/lib/byok/server";

export async function GET() {
  try {
    return Response.json(await getByokPublicKey(), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const response = createApiErrorResponse(error, "BYOK is not configured");
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
