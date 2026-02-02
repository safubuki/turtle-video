/**
 * @file App.tsx
 * @author Turtle Village
 */
import TurtleVideo from './components/TurtleVideo';
import ErrorBoundary from './components/common/ErrorBoundary';




import { useOrientationLock } from './hooks/useOrientationLock';

function App() {
  // 可能な限り縦画面に固定を試みる（スマホ対策）
  useOrientationLock('portrait');

  return (
    <ErrorBoundary>
      <TurtleVideo />
    </ErrorBoundary>
  );
}

export default App;
