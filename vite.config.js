import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    // Keep the output readable so __vitePreload and the original identifiers
    // are visible in dist/assets/index-*.js.
    minify: false
  }
})
