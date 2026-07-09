export type ChatToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: unknown;
  };
};
