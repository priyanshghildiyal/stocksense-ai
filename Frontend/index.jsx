import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Keep diagnostics available to developers without exposing internals in the UI.
    console.error('StockSense interface error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main
          role="alert"
          style={{
            minHeight: '100vh',
            display: 'grid',
            placeContent: 'center',
            gap: '12px',
            padding: '24px',
            background: '#f6f8f7',
            color: '#1c2927',
            fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}
        >
          <h1 style={{ margin: 0, fontSize: '22px' }}>This workspace hit a problem.</h1>
          <p style={{ maxWidth: '440px', margin: 0, lineHeight: 1.6, color: '#64716c' }}>
            Your saved browser data has not been intentionally changed. Reload the page to try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ justifySelf: 'start', padding: '10px 14px', border: 0, borderRadius: '5px', background: '#147b67', color: '#fff', font: 'inherit', cursor: 'pointer' }}
          >
            Reload workspace
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
