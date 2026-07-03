import { createApiSuccessResponse } from "../../../lib/api/responses";
import { getServiceHealthStatus } from "../../../lib/services/serviceHealth";

export async function GET() {
  return createApiSuccessResponse(getServiceHealthStatus());
}
