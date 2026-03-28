import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

/** GitHub Pages project site: https://owner.github.io/repo/ — в CI всегда есть GITHUB_REPOSITORY */
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = repoName ? `/${repoName}/` : '/'

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
