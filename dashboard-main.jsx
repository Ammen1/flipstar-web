// Entry point for the private dashboard at its own hostname.
//
// The same AdminApp the public app used to serve at /admin/*, mounted on its
// own. Nothing is duplicated: pages, components and the API client are the
// existing ones, imported from the same files.
//
// Access control is NOT decided here. AdminApp's own check that the signed-in
// account is staff (or an organization account) only chooses what to render;
// the API refuses a non-staff caller regardless -- AdminPathGuardMiddleware on
// every /api/admin/ and /api/v1/admin/ path, plus each view's own permissions.
// A user who edits this bundle in their browser gains a screen, not data.
import './styles/typography.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import { AdminApp } from './admin/AdminApp';

class DashboardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Dashboard crashed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24,
          background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui', textAlign: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ color: '#999', margin: '0 0 18px' }}>Reload the dashboard to continue.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              minHeight: 44, padding: '0 20px', borderRadius: 10, border: 'none',
              background: '#8fc441', color: '#07130a', fontWeight: 800, cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DashboardErrorBoundary>
      <ThemeProvider>
        <AdminApp />
      </ThemeProvider>
    </DashboardErrorBoundary>
  </React.StrictMode>
);
