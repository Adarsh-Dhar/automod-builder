import './index.css';
import './styles/globals.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { InitProvider } from './contexts/init-context';
import { ThemeProvider } from './contexts/theme-context';
import { RuleStagePage } from './pages/RuleStagePage';

function App() {
  return (
    <InitProvider>
      <ThemeProvider>
        <RuleStagePage />
      </ThemeProvider>
    </InitProvider>
  );
}

export default App;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
