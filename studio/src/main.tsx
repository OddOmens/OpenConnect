import { createRoot } from 'react-dom/client';
import './fonts';
import { RenderPage } from './render/RenderPage';
import { Editor } from './Editor';
import './styles.css';
import { at } from './base';

const root = createRoot(document.getElementById('root')!);
if (location.pathname === at('/render')) {
  document.body.style.margin = '0';
  root.render(<RenderPage />);
} else {
  root.render(<Editor />);
}
