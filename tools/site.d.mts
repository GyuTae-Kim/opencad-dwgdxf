import type { Site } from 'opencad-site-kit/seo/site-metadata';
import type { LazyRules, Precache, serviceWorker } from 'opencad-site-kit/pwa/sw-plugin';
export const site: Site;
export const offline: Parameters<typeof serviceWorker>[0];
export const precache: Precache;
export const lazy: LazyRules;
