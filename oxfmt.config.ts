import { defineConfig } from "oxfmt";

export default defineConfig({
  ignorePatterns: ["assets/"],
  printWidth: 140,
  singleQuote: false,
  insertFinalNewline: true,
  sortImports: {
    newlinesBetween: false,
  },
});
