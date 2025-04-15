// Uncomment this line to use CSS modules
// import styles from './app.module.css';
import { ChatProvider } from '@hashbrownai/react';
import { ChatPanel } from './shared/ChatPanel';

export function App() {
  return (
    <div className="flex flex-col p-4">
      <ChatProvider
        model="gpt-4o-mini"
        temperature={0.5}
        tools={[]}
        maxTokens={1000}
      >
        <ChatPanel />
      </ChatProvider>
      {/* <div role="navigation">
        <ul>
          <li>
            <Link to="/">Home</Link>
          </li>
          <li>
            <Link to="/page-2">Page 2</Link>
          </li>
        </ul>
      </div> */}
      {/* <Routes>
        <Route
          path="/"
          element={
            <div>
              This is the generated root route.{' '}
              <Link to="/page-2">Click here for page 2.</Link>
            </div>
          }
        />
        <Route
          path="/page-2"
          element={
            <div>
              <Link to="/">Click here to go back to root page.</Link>
            </div>
          }
        />
      </Routes> */}
      {/* END: routes */}
    </div>
  );
}

export default App;
