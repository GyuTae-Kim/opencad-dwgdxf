import type { Plugin } from 'vite';
export function listFiles(root: string): string[];
export function precacheable(path: string, lazy?: Set<string>): boolean;
export function precacheUrls(files: string[], lazy?: Set<string>): string[];
export function fingerprint(files: string[], read: (file: string) => Uint8Array | string): string;
export function serviceWorkerSource(o: { version: string; staticVersion: string; precache: string[]; assets: string[] }, template?: string): string;
export function lazyFiles(bundle: Record<string, { type: 'chunk' | 'asset'; fileName: string; facadeModuleId?: string | null; moduleIds?: string[]; modules?: Record<string, unknown>; originalFileNames?: string[]; originalFileName?: string | null }>): Set<string>;
export function serviceWorker(): Plugin;
