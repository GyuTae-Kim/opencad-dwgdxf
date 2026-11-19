import { installLocalization } from './app/i18n';
import './styles.css';
import { initAnalytics } from 'opencad-site-kit/analytics';
import { OPENCAD_ANALYTICS } from 'opencad-site-kit/presets/opencad';
import { mountEditor } from './app/startup';

const root = document.getElementById('app');
if (root) {
  initAnalytics(OPENCAD_ANALYTICS, 'dwgdxf');
  mountEditor(root, async () => (await import('./editor')).startEditor(root));
}

if (root) void installLocalization(root);
