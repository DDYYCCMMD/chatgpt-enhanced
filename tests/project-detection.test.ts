import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { JSDOM } from 'jsdom';
import { discoverProjects, projectAtTarget, projectIdFromUrl } from '../src/features/project-colors/detection.ts';

const id = 'g-p-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const fixture = readFileSync(new URL('./fixtures/sidebar.html', import.meta.url), 'utf8');

test('project URLs normalize stable IDs, independently of slugs, queries, and renaming', () => {
  for (const url of [`/g/${id}-name/project`, `/g/${id}-renamed/project/?x=1#top`,
    `https://chatgpt.com/g/${id}/project`, `/g/${id}-%E9%A1%B9%E7%9B%AE/project`,
    `/g/${id}-name`, `/g/${id}`, `/projects/${id}`, `/project/${id}`]) {
    assert.equal(projectIdFromUrl(url), id);
  }
  assert.equal(projectIdFromUrl(`/g/${id.toUpperCase()}-name/project`), id);
  const uuid = 'g-p-12345678-1234-1234-1234-123456789abc';
  assert.equal(projectIdFromUrl(`/g/${uuid}-name/project`), uuid);
});

test('conversation, custom GPT, external, ambiguous, and malformed routes are rejected', () => {
  for (const url of ['/c/chat', `/g/${id}/c/chat`, `/g/${id}-name/c/chat`,
    '/g/g-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-name/project', `/g/${id}-name/c/unknown`,
    `/projects/unknown`, `/g/g-p-abc-name/project`, `https://example.com/g/${id}/project`,
    `https://chatgpt.com.evil.test/g/${id}/project`, `http://chatgpt.com/g/${id}/project`,
    `https://user:pass@chatgpt.com/g/${id}/project`, 'javascript:alert(1)', 'http://[']) {
    assert.equal(projectIdFromUrl(url), null, url);
  }
});

test('sidebar fixtures distinguish project headers from chats and duplicate visible names', () => {
  const dom = new JSDOM(fixture);
  const doc = dom.window.document;
  const rows = discoverProjects(doc.getElementById('stage-slideover-sidebar')!);
  assert.deepEqual(rows.map((row) => row.element.id), ['project-a', 'project-b', 'metadata-project', 'action-project']);
  assert.notEqual(rows[0]!.id, rows[1]!.id);
  assert.equal(rows[0]!.element.textContent, rows[1]!.element.textContent);
  assert.equal(projectAtTarget(doc.getElementById('native-menu')!, rows), undefined);
  assert.equal(projectAtTarget(doc.querySelector('#project-a span')!, rows)?.id, id);
  dom.window.close();
});

test('conflicting metadata and URL identities fail closed', () => {
  const dom = new JSDOM(`<aside><a data-app-action-sidebar-project-id="g-p-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" href="/g/${id}/project">Conflict</a></aside>`);
  assert.deepEqual(discoverProjects(dom.window.document.querySelector('aside')!), []);
  dom.window.close();
});
