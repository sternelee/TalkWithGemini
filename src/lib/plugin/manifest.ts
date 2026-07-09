interface PluginFunctionLike {
  name: string;
  path?: string;
  method?: string;
}

interface PluginLike {
  functions?: PluginFunctionLike[];
}

export function getPluginFunctionDefinitionError(
  plugin: PluginLike,
  functionDef: PluginFunctionLike,
): string | null {
  const declaredFunction = plugin.functions?.find(
    (fn) => fn.name === functionDef.name,
  );

  if (!declaredFunction) {
    return "Plugin function is not declared by this plugin";
  }

  if (
    !declaredFunction.path ||
    !declaredFunction.method ||
    !functionDef.path ||
    !functionDef.method
  ) {
    return "Plugin function path or method is missing";
  }

  if (
    declaredFunction.path !== functionDef.path ||
    declaredFunction.method.toUpperCase() !== functionDef.method.toUpperCase()
  ) {
    return "Plugin function definition does not match the manifest";
  }

  return null;
}

export function getPluginFunctionPathError(
  functionDef: Pick<PluginFunctionLike, "path">,
): string | null {
  const path = functionDef.path?.trim() || "";

  if (!path) {
    return "Plugin function path is missing";
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//")) {
    return "Plugin function paths must be relative";
  }

  return null;
}
