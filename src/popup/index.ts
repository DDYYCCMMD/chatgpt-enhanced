import './style.css';
import { FEATURE_IDS, FEATURE_LABELS } from '../shared/settings.ts';
import { observeSettings, setFeatureEnabled } from '../storage/settings.ts';
import { checkCurrentPage } from './page-status.ts';

function element<T extends HTMLElement>(id: string): T {
  const result = document.getElementById(id);
  if (!result) throw new Error(`Missing popup element: ${id}`);
  return result as T;
}

element('version').textContent = `Version ${chrome.runtime.getManifest().version}`;
const fieldset = element<HTMLFieldSetElement>('features');
const status = element('status');
const inputs = Object.fromEntries(
  FEATURE_IDS.map((id) => [id, element<HTMLInputElement>(id)]),
) as Record<(typeof FEATURE_IDS)[number], HTMLInputElement>;

const unsubscribe = observeSettings((settings) => {
  for (const id of FEATURE_IDS) inputs[id].checked = settings[id];
  fieldset.disabled = false;
  status.textContent = 'Preferences are saved automatically.';
}, () => {
  fieldset.disabled = true;
  status.textContent = 'Could not load preferences. Reopen the popup to retry.';
});

for (const id of FEATURE_IDS) {
  const input = inputs[id];
  input.addEventListener('change', () => {
    const enabled = input.checked;
    input.disabled = true;
    status.textContent = 'Saving…';
    void setFeatureEnabled(id, enabled).then(() => {
      status.textContent = `${FEATURE_LABELS[id]} preference saved.`;
      pageStatus.textContent = '设置已保存，请点击“检查当前页”查看更新后的页面状态。';
    }).catch(() => {
      input.checked = !enabled;
      status.textContent = 'Could not save preference. Please try again.';
    }).finally(() => {
      input.disabled = false;
    });
  });
}

window.addEventListener('pagehide', unsubscribe, { once: true });

const checkButton = element<HTMLButtonElement>('check-page');
const pageStatus = element('page-status');
async function updatePageStatus(): Promise<void> {
  checkButton.disabled = true;
  pageStatus.textContent = '正在检查当前标签页…';
  try { pageStatus.textContent = await checkCurrentPage(); }
  finally { checkButton.disabled = false; }
}
checkButton.addEventListener('click', () => { void updatePageStatus(); });
void updatePageStatus();
