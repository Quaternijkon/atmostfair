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
    'actions/configure-pages@v5',
    'actions/upload-pages-artifact@v5',
    'actions/deploy-pages@v5',
  ]) {
    assert.match(workflow, new RegExp(action.replace('/', '\\/')), `workflow should use ${action}`);
  }

  assert.doesNotMatch(
    workflow,
    /actions\/(?:checkout|setup-node|configure-pages|upload-pages-artifact|deploy-pages)@v4/,
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

test('GitHub Pages workflow retries transient deploy failures once', async () => {
  const workflow = await readFile(path.join(root, '.github/workflows/deploy.yml'), 'utf8');

  assert.match(
    workflow,
    /url:\s*\$\{\{\s*steps\.deployment\.outputs\.page_url\s*\|\|\s*steps\.deployment_retry\.outputs\.page_url\s*\}\}/,
    'Pages environment URL should report the successful first deploy or retry URL',
  );
  assert.match(
    workflow,
    /id:\s+deployment[\s\S]{0,160}uses:\s+actions\/deploy-pages@v5[\s\S]{0,160}continue-on-error:\s+true/,
    'The first deploy attempt should continue so a transient Pages failure can be retried',
  );
  assert.match(
    workflow,
    /id:\s+deployment_retry[\s\S]{0,120}if:\s+\$\{\{\s*steps\.deployment\.outcome\s*==\s*'failure'\s*\}\}[\s\S]{0,160}uses:\s+actions\/deploy-pages@v5/,
    'A second deploy attempt should run only when the first deploy-pages step fails',
  );
  assert.doesNotMatch(
    workflow,
    /id:\s+deployment_retry[\s\S]{0,220}continue-on-error:\s+true/,
    'The retry attempt should fail the workflow when Pages still cannot deploy',
  );
});
