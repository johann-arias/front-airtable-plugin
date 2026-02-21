import { useFrontContext } from './providers/frontContext';
import RidersPanel from './components/RidersPanel';
import './App.css';

function App() {
  const context = useFrontContext();

  if (!context) {
    return (
      <div className="app">
        <p className="message">Connecting to Front…</p>
      </div>
    );
  }

  switch (context.type) {
    case 'noConversation':
      return (
        <div className="app">
          <p className="message">Select a conversation to look up Riders by email.</p>
        </div>
      );
    case 'singleConversation':
      return (
        <div className="app">
          <RidersPanel />
        </div>
      );
    case 'multiConversations':
      return (
        <div className="app">
          <p className="message">Select a single conversation to use this plugin.</p>
        </div>
      );
    default:
      return (
        <div className="app">
          <p className="message">Select a conversation to use this plugin.</p>
        </div>
      );
  }
}

export default App;
