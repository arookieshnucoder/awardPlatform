/** Keep successful sign-ins inside the portal, including restored sessions. */
export function loginDestination(search: string): string {
  const requested = new URLSearchParams(search).get('redirect')
  if (!requested?.startsWith('/') || requested.startsWith('//') || /[\\\s]/.test(requested)) {
    return '/overview'
  }

  const path = new URL(requested, 'https://portal.invalid').pathname.replace(/\/+$/, '')
  if (!path || path === '/login' || path === '/register') return '/overview'
  return requested
}
