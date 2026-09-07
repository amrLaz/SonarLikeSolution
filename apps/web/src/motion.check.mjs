import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

assert.match(index, /id="startup-splash"[^>]+role="status"/, 'Startup splash exposes a status');
assert.match(index, /id="root" inert aria-hidden="true"/, 'The application stays inaccessible below the splash');
assert.match(main, /SPLASH_MIN_MS = 600/, 'Startup splash remains visible for the agreed minimum');
assert.match(main, /root\.removeAttribute\('inert'\)/, 'The application becomes interactive when startup completes');
assert.match(main, /prefers-reduced-motion: reduce/, 'Startup dismissal handles reduced motion without a fade');
assert.match(app, /<div key=\{activeTab\} className="workspace-view" id="workspace-content"/, 'Primary view changes remount the transition surface');
assert.match(styles, /\.workspace-view\s*\{[^}]*animation: workspace-view-enter 220ms/s, 'Primary views use a visible but restrained motion contract');
assert.match(styles, /@keyframes workspace-view-enter\s*\{[\s\S]*opacity: 0\.35;[\s\S]*transform: translateY\(10px\)/, 'Primary views combine fade and short translation');
assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none !important/, 'The global reduced-motion guard disables animations');

console.log('Startup splash and primary view motion checks passed.');
