import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const alias = { '@': fileURLToPath(new URL('.', import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      // Pure unit tests, no external services
      { resolve: { alias }, test: { name: 'unit', include: ['tests/unit/**/*.test.ts'] } },
      // Security rules tests, need the Firestore emulator (JDK 21+)
      { resolve: { alias }, test: { name: 'rules', include: ['tests/rules/**/*.test.ts'] } },
    ],
  },
});
