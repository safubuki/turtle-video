import TurtleVideo from '../../components/TurtleVideo';
import { standardExportRuntime } from './standardExportRuntime';
import { standardPreviewRuntime } from './standardPreviewRuntime';

function StandardApp() {
  return <TurtleVideo previewRuntime={standardPreviewRuntime} exportRuntime={standardExportRuntime} />;
}

export default StandardApp;