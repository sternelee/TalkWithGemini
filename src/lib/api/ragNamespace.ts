export const RAG_DEFAULT_NAMESPACE_ERROR =
  "Custom RAG namespace requires user-provided credentials";

export function resolveRagNamespace({
  useDefault,
  requestedNamespace,
  defaultNamespace,
}: {
  useDefault: boolean;
  requestedNamespace?: string;
  defaultNamespace?: string;
}): { ok: true; namespace: string } | { ok: false; error: string } {
  const requested = requestedNamespace?.trim() || "";
  const configured = defaultNamespace?.trim() || "";

  if (!useDefault) {
    return { ok: true, namespace: requested };
  }

  if (requested && requested !== configured) {
    return { ok: false, error: RAG_DEFAULT_NAMESPACE_ERROR };
  }

  return { ok: true, namespace: configured };
}
