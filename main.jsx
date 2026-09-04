// Centralised typography. Must load before any component renders: without it
// the app has no font-family at all outside admin/ and falls back to the
// browser's default serif.
import './styles/typography.css';
import ReactDOM from 'react-dom/client';
import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { ThemeProvider } from './contexts/ThemeContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { AuthProvider } from './contexts/AuthContext';
import { BlockProvider } from './contexts/BlockContext';

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

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('App crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '100vh', fontFamily: 'system-ui',
          background: '#0a0a0a', color: '#fff', padding: 20, textAlign: 'center',
        }}>
          <h1 style={{ fontSize: 24, marginBottom: 12 }}>Something went wrong</h1>
          <p style={{ color: '#999', marginBottom: 20, maxWidth: 400 }}>
            The app encountered an unexpected error. Please try refreshing the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px', background: '#8fc441', color: '#000',
              border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function mountApp() {
  const rootElement = document.getElementById('root');
  if (!rootElement) return;
  if (!rootElement._reactRoot) {
    const root = ReactDOM.createRoot(rootElement);
    rootElement._reactRoot = root;
    root.render(
      <ErrorBoundary>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <BlockProvider>
                <RouterProvider router={router} />
              </BlockProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </ErrorBoundary>,
    );
  }
}

// Initialize VConsole for mobile debugging (dev mode or debug=true query param)
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

// Skeleton removal fallback
setTimeout(() => {
  const skeleton = document.getElementById('app-skeleton');
  if (skeleton) {
    skeleton.style.transition = 'opacity 0.2s ease';
    skeleton.style.opacity = '0';
    setTimeout(() => skeleton.remove(), 220);
  }
}, 2000);
