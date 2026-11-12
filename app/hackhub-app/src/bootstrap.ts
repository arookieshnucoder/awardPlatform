import { useAuthStore } from './store/authStore'
import { preloadProjectShowcase } from './lib/preloadShowcase'

// Restore the cookie session while the browser downloads the application and styles.
void useAuthStore.getState().initialize()
void import('./main')
if (/^\/(nominate|projects)\/?$/.test(window.location.pathname)) preloadProjectShowcase()
