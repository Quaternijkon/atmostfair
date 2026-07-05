import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

test('GitHub Pages workflow uses Node 24 compatible action majors', async () => {
  const workflow = await readFile(path.join(root, '.github/workflows/deploy.yml'), 'utf8');

  for (const action of [
    'actions/checkout@v6',
    'actions/setup-node@v6',
    'actions/upload-pages-artifact@v5',
    'actions/deploy-pages@v5',
  ]) {
    assert.match(workflow, new RegExp(action.replace('/', '\\/')), `workflow should use ${action}`);
  }

  assert.doesNotMatch(
    workflow,
    /actions\/(?:checkout|setup-node|upload-pages-artifact|deploy-pages)@v4/,
    'workflow should not pin Pages deployment actions to Node 20-era v4 majors',
  );
});

test('GitHub Pages workflow ignores backend-only changes', async () => {
  const workflow = await readFile(path.join(root, '.github/workflows/deploy.yml'), 'utf8');

  assert.match(workflow, /workflow_dispatch:/, 'workflow should support manual deployment retries');
  assert.match(workflow, /paths:\s*\n(?:\s+- .+\n)+/, 'workflow should constrain Pages deploy triggers by path');

  for (const expectedPath of [
    '.github/workflows/deploy.yml',
    'src/**',
    'index.html',
    'package.json',
    'package-lock.json',
    'vite.config.*',
    'postcss.config.*',
    'tailwind.config.*',
  ]) {
    assert.match(
      workflow,
      new RegExp(`- ['"]?${expectedPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}['"]?`),
      `workflow should deploy when ${expectedPath} changes`,
    );
  }

  assert.doesNotMatch(workflow, /-\s+['"]?server\/\*\*/, 'backend-only changes should not trigger Pages deploy');
});
