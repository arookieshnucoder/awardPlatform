type ShowcaseModule = typeof import('../pages/ProjectShowcase')

let request: Promise<{ default: ShowcaseModule['ProjectShowcase'] }> | undefined
export let preloadedProjectShowcase: ShowcaseModule['ProjectShowcase'] | undefined

export function loadProjectShowcase() {
  request ??= import('../pages/ProjectShowcase').then(({ ProjectShowcase }) => {
    preloadedProjectShowcase = ProjectShowcase
    return { default: ProjectShowcase }
  }).catch((error: unknown) => {
    request = undefined
    throw error
  })
  return request
}

export function preloadProjectShowcase() {
  void loadProjectShowcase().catch(() => { /* Navigation still handles a failed preload. */ })
}
