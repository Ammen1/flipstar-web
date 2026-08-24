import ReactDOM from 'react-dom/client';
import WerqRoot from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';

// When Vite deploys a new build, old chunk filenames (content-hashed) no longer exist.
// Browsers with cached HTML will try to import old chunk URLs → 404.
// Reload once to pick up the fresh HTML with new chunk references.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const reloadKey = '__vite_reload__';
  if (!sessionStorage.getItem(reloadKey)) {
    sessionStorage.setItem(reloadKey, '1');
    window.location.reload();
  }
});

// Prevent double-mounting in HMR or reload scenarios
function mountApp() {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;
  if (!rootElement._reactRoot) {
    const root = ReactDOM.createRoot(rootElement);
    rootElement._reactRoot = root;
    root.render(
      <ThemeProvider>
        <LanguageProvider>
          <WerqRoot />
        </LanguageProvider>
      </ThemeProvider>,
    );
  }
}

// Initialize VConsole for mobile debugging (dev mode or debug=true query param)
// Load VConsole dynamically to avoid CSP violations
if (import.meta.env.DEV || window.location.search.includes('debug=true')) {
  const script = document.createElement('script');
  script.src = 'https://unpkg.com/vconsole@latest/dist/vconsole.min.js';
  script.onload = () => {
    if (window.VConsole) {
      window.vConsole = new window.VConsole();
      console.log('[FlipStar] VConsole initialized for mobile debugging');
    }
  };
  document.head.appendChild(script);
}

// Mount when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp);
} else {
  mountApp();
}

// Skeleton removal is handled by components when content is ready.
// Fallback: remove after 2s max so it never stays forever (e.g. error paths).
setTimeout(() => {
  const skeleton = document.getElementById('app-skeleton');
  if (skeleton) {
    skeleton.style.transition = 'opacity 0.2s ease';
    skeleton.style.opacity = '0';
    setTimeout(() => skeleton.remove(), 220);
  }
}, 2000);
