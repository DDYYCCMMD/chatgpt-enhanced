import './style.css';
import { FEATURE_IDS, FEATURE_LABELS } from '../shared/settings.ts';
import { observeSettings, setFeatureEnabled } from '../storage/settings.ts';
import { checkCurrentPage } from './page-status.ts';
import { NAVIGATION_BACKUP_SETTING, getNavigationBackupEnabled, setNavigationBackupEnabled, clearNavigationBackups } from '../storage/navigation-backup.ts';

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

const backupToggle = element<HTMLInputElement>('navigationBackup');
const backupFieldset = element<HTMLFieldSetElement>('history-backup');
const backupStatus = element('backup-status');
void getNavigationBackupEnabled().then((enabled) => { backupToggle.checked = enabled; backupFieldset.disabled = false; })
  .catch(() => { backupStatus.textContent = '无法读取备份设置，请重新打开弹窗。'; });
const backupListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
  if (area === 'local' && changes[NAVIGATION_BACKUP_SETTING]) backupToggle.checked = changes[NAVIGATION_BACKUP_SETTING].newValue === true;
};
chrome.storage.onChanged.addListener(backupListener);
window.addEventListener('pagehide', () => chrome.storage.onChanged.removeListener(backupListener), { once: true });
backupToggle.addEventListener('change', () => {
  const enabled = backupToggle.checked; backupFieldset.disabled = true;
  void setNavigationBackupEnabled(enabled).then(() => {
    backupStatus.textContent = enabled ? '已开启本地备份。只保存问题目录，不发送到网络。' : '已停止备份读写，已有备份可用下方按钮清除。';
  }).catch(() => { backupToggle.checked = !enabled; backupStatus.textContent = '设置保存失败，请重试。'; })
    .finally(() => { backupFieldset.disabled = false; });
});
element<HTMLButtonElement>('clear-navigation-backup').addEventListener('click', () => {
  backupFieldset.disabled = true;
  void clearNavigationBackups().then(() => { backupToggle.checked = false; backupStatus.textContent = '已关闭备份并清除所有本地问题目录，项目和聊天颜色不受影响。'; })
    .catch(() => { backupStatus.textContent = '清除未完成，请重试。'; }).finally(() => { backupFieldset.disabled = false; });
});
