import { HashbrownProvider } from '@hashbrownai/react';
import { ChartPage } from './chart/ChartPage';

export function App() {
  return (
    <HashbrownProvider url="http://localhost:3000/api/chat">
      <ChartPage />
    </HashbrownProvider>
  );
}

export default App;
