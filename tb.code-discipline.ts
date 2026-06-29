export default {
  sourceRoot: ".",
  sourceExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".go"],
  excludeDirs: {
    gitignore: true,
  },
  logging: {
    enabled: true,
    quiet: false,
  },
  tsconfigPaths: {
    normalize: "relative-dot-prefix",
    restoreAfterRun: false,
  },
  rules: {
    maxFileLines: {
      max: 350,
    },
    maxFunctionLines: {
      max: 50,
    },
    folderizeCompoundFiles: {},
    syncImports: {
      alias: {
        strategy: "random",
      },
      allowRelative: ["./"],
      packageJsonImports: {
        enabled: true,
        aliasPrefix: "#",
      },
    },
    dry: {
      helpers: [
        {
          from: "./src/utils/text.ts",
          exportName: "text",
        },
        {
          from: "./src/utils/text.ts",
          exportName: "isTruthy",
        },
      ],
    },
  },
};
