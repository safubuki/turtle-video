import TurtleVideo from '../../components/TurtleVideo';
import { standardPreviewRuntime } from './standardPreviewRuntime';

function StandardApp() {
  return <TurtleVideo previewRuntime={standardPreviewRuntime} />;
}

export default StandardApp;