import { getSafeOPFSPath } from "./opfs";

const OPFS_PROTOCOL = "opfs://";

export interface OPFSReconciliationInput {
  expectedUrls: string[];
  actualPaths: string[];
}

export interface OPFSReconciliationPlan {
  missingUrls: string[];
  orphanUrls: string[];
}

export function toOPFSUrl(path: string): string {
  return path.startsWith(OPFS_PROTOCOL) ? path : `${OPFS_PROTOCOL}${path}`;
}

export function getOPFSReconciliationPlan({
  expectedUrls,
  actualPaths,
}: OPFSReconciliationInput): OPFSReconciliationPlan {
  const expectedPaths = new Set(
    expectedUrls
      .map((url) => getSafeOPFSPath(url))
      .filter((path): path is string => Boolean(path)),
  );
  const actualPathSet = new Set(actualPaths);

  return {
    missingUrls: Array.from(expectedPaths)
      .filter((path) => !actualPathSet.has(path))
      .map(toOPFSUrl),
    orphanUrls: actualPaths
      .filter((path) => !expectedPaths.has(path))
      .map(toOPFSUrl),
  };
}
