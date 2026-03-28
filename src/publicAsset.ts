/**
 * Файлы из `public/` (data/zones.json, текстуры). На GitHub Pages приложение в
 * подкаталоге `/repo/`, а `import.meta.env.BASE_URL` бывает `/` при неверной сборке —
 * тогда берём первый сегмент пути с github.io.
 */
export function publicAsset(relativePath: string): string {
  const clean = relativePath.replace(/^\/+/, '')
  let base = import.meta.env.BASE_URL
  if (typeof base !== 'string') base = '/'

  if (
    base === '/' &&
    typeof window !== 'undefined' &&
    window.location.hostname.endsWith('github.io')
  ) {
    const parts = window.location.pathname.split('/').filter(Boolean)
    if (parts.length >= 1) {
      base = `/${parts[0]}/`
    }
  }

  const b = base.endsWith('/') ? base : `${base}/`
  return `${b}${clean}`
}
