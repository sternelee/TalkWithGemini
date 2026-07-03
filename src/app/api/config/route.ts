import { createApiSuccessResponse } from "../../../lib/api/responses";
import { getPublicServerConfig } from "../../../lib/defaultConfig/server";

export async function GET() {
  return createApiSuccessResponse(getPublicServerConfig());
}
