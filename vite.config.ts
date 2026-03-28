import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

/** GitHub Pages project site: https://owner.github.io/repo/ → assets under /repo/ */
const repoName = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base =
  process.env.GITHUB_ACTIONS === 'true' && repoName
    ? `/${repoName}/`
    : '/'

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
