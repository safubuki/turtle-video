import TurtleVideo from '../../components/TurtleVideo';
import { appleSafariExportRuntime } from './appleSafariExportRuntime';
import { appleSafariPreviewRuntime } from './appleSafariPreviewRuntime';

function AppleSafariApp() {
  return <TurtleVideo previewRuntime={appleSafariPreviewRuntime} exportRuntime={appleSafariExportRuntime} />;
}

export default AppleSafariApp;