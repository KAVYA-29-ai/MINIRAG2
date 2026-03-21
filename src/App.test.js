import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

test('renders App without crashing', () => {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(<App />);

  root.unmount();
  document.body.removeChild(container);
});
