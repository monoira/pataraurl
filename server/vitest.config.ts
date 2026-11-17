import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: "./",
    include: ["**/*.spec.ts"],
    coverage: {
      provider: "v8",
      exclude: [
        "node_modules/**",
        "dist/**",
        "src/**/*.entity.ts",
        "src/migrations/**",
        "src/main.ts",
        "src/data-source.ts",
      ],
    },
  },
});
