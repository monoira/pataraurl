import { defineConfig } from 'oxfmt';

export default defineConfig({
  singleQuote: true,
  trailingComma: 'all',
  ignorePatterns: ['dist/', '.agents/'],
});
