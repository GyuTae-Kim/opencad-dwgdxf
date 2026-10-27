import { installLocalization } from './app/i18n';
import './styles.css';
import { initAnalytics } from 'opencad-site-kit/analytics';
import { GA4_MEASUREMENT_ID } from 'opencad-site-kit/analytics/config';
import { mountEditor } from './app/startup';

const root = document.getElementById('app');
if (root) {
  initAnalytics(GA4_MEASUREMENT_ID, 'dwgdxf');
  mountEditor(root, async () => (await import('./editor')).startEditor(root));
}

if (root) void installLocalization(root);
