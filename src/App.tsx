import TurtleVideo from './components/TurtleVideo';
import ErrorBoundary from './components/common/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <TurtleVideo />
    </ErrorBoundary>
  );
}

export default App;
