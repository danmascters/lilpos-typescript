import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { beforeAll } from 'vitest';

function runScript(filePath: string) {
  const code = fs.readFileSync(filePath, 'utf8');
  vm.runInThisContext(code, { filename: filePath });
}

beforeAll(() => {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const dist = path.join(repoRoot, 'dist', 'app', 'payments');
  const files = [
    'payment-types.js',
    'payment-math.js',
    'split-payment-math.js',
    'split-payment-state.js',
    'payment-state.js',
    'order-payment-context.js',
    'cash-payment-pane.js',
    'card-payment-pane.js',
    'text-link-payment-pane.js',
    'split-payment-pane.js',
    'payment-pane.js'
  ];
  files.forEach((name) => runScript(path.join(dist, name)));
});
