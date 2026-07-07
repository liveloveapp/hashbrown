module.exports = (config) => {
  if (!config.output) {
    return config;
  }

  const outputs = Array.isArray(config.output)
    ? config.output
    : [config.output];

  return {
    ...config,
    output: outputs.map((output) => {
      const extension = output.format === 'cjs' ? 'cjs' : 'mjs';

      return {
        ...output,
        entryFileNames: `[name].${extension}`,
        chunkFileNames: `[name]-[hash].${extension}`,
      };
    }),
  };
};
