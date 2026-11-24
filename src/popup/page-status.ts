import { isPageStatus, PAGE_STATUS_REQUEST } from '../shared/page-status.ts';
import type { PageStatus } from '../shared/page-status.ts';

export function describePageStatus(status: PageStatus, popupVersion: string): string {
  const lines = [`页面脚本：${status.version}（已连接）`];
  if (status.version !== popupVersion) lines.push('页面版本与扩展不一致，请刷新 ChatGPT。');
  if (status.phase === 'error') lines.push('设置读取失败，请刷新 ChatGPT 后重试。');
  else if (status.phase === 'loading') lines.push('页面设置仍在加载，请稍后重试。');
  lines.push(`Project Colors：${status.settings.projectColors ? status.projectReady ? '已开启' : '正在加载/读取失败' : '关闭'}`);
  lines.push(`Chat Colors：${status.settings.chatColors ? status.chatReady ? '已开启' : '正在加载/读取失败' : '关闭'}`);
  lines.push(`识别到 ${status.projects} 个项目、${status.chats} 个聊天（${status.roots} 个侧边栏区域）。`);
  if (!status.settings.projectColors && !status.settings.chatColors) lines.push('两个颜色开关均关闭，右键会保留浏览器菜单。');
  else if (!status.roots) lines.push('未发现侧边栏，请展开 ChatGPT 侧边栏再检查。');
  const last = {
    none: '尚未收到右键；请在侧边栏项目或聊天行直接右键后再点检查。',
    project: '最近右键：已接管项目菜单。', chat: '最近右键：已接管聊天菜单。',
    unrecognized: '最近右键：未识别目标，保留原生菜单。',
    'not-ready': '最近右键：颜色设置尚未读取成功。', ambiguous: '最近右键：身份冲突，保留原生菜单。',
  };
  lines.push(last[status.lastContext]);
  return lines.join('\n');
}

export async function checkCurrentPage(): Promise<string> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    // No tabs/activeTab permission: read only the active tab ID, not its URL/title.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id === undefined) return '找不到当前标签页，请切回 ChatGPT 后重试。';
    const response: unknown = await Promise.race([
      chrome.tabs.sendMessage(tab.id, { type: PAGE_STATUS_REQUEST }, { frameId: 0 }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Page status timeout')), 3000); }),
    ]);
    if (!isPageStatus(response)) return '当前页脚本不支持连接检查。请在扩展管理页 Reload，再刷新 ChatGPT。';
    return describePageStatus(response, chrome.runtime.getManifest().version);
  } catch {
    return '未连接到当前页脚本。请在实际 ChatGPT 标签页打开弹窗；若已在 ChatGPT，请先在 chrome://extensions 点击 Reload，再刷新该标签页。旧标签页或旧版脚本也会显示此结果。';
  } finally {
    clearTimeout(timeout);
  }
}
