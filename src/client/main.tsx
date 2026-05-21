import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './contexts/theme-context';
import { RuleStagePage } from './pages/RuleStagePage';

function App() {
  return (
    <ThemeProvider>
      <RuleStagePage />
    </ThemeProvider>
  );
}

export default App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);