import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "import"],
  categories: {
    suspicious: "warn",
  },
  rules: {
    eqeqeq: "warn",
    "unicorn/prefer-node-protocol": "warn",
    "typescript/consistent-type-imports": "warn",
  },
});
