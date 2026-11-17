export const isShippedPluginFile = name => name.startsWith("plugin/")
  && !name.startsWith("plugin/templates/")
  && !name.startsWith("plugin/evals/")
  && !name.endsWith(".test.mjs");
