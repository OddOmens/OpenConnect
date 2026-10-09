import { createRoot } from 'react-dom/client';
import './fonts';
import { RenderPage } from './render/RenderPage';
import { Editor } from './Editor';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
if (location.pathname === '/render') {
  document.body.style.margin = '0';
  root.render(<RenderPage />);
} else {
  root.render(<Editor />);
}
