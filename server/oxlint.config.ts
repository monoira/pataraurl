import { defineConfig } from "oxlint";

export default defineConfig({
  options: {
    typeAware: true,
  },
  categories: {
    correctness: "warn",
    suspicious: "warn",
    perf: "warn",
  },
  env: {
    node: true,
  },
  rules: {
    "typescript/no-explicit-any": "off",
    "typescript/no-extraneous-class": ["warn", { allowWithDecorator: true }],
    "typescript/no-floating-promises": "error",
  },
});
