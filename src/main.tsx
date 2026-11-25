import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// In proxied development previews where WebSocket HMR upgrades are blocked,
// @vite/client may emit a benign "WebSocket closed without opened." rejection.
// Intercept ONLY that specific dev HMR noise while keeping all real app errors visible.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = String(reason?.message || reason || '');
    const stack = String(reason?.stack || '');
    if (
      msg.includes('WebSocket closed without opened') ||
      (stack.includes('/@vite/client') && msg.toLowerCase().includes('websocket'))
    ) {
      event.preventDefault();
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
