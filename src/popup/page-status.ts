import { isPageStatus, PAGE_STATUS_REQUEST } from '../shared/page-status.ts';
import type { PageStatus } from '../shared/page-status.ts';
import type { NavigationStatus } from '../shared/navigation-status.ts';

export function describeNavigation(status: NavigationStatus): string {
  const count = `已识别当前会话累计 ${status.questions} 条用户问题`;
  switch (status.phase) {
    case 'disabled': return '问题导航：关闭。';
    case 'waiting-conversation': return '问题导航：未识别到会话地址，请打开一个已有聊天。';
    case 'waiting-container': return '问题导航：没有识别到当前会话容器，可能是页面结构不兼容。';
    case 'empty': return '问题导航：已找到会话容器，但没有识别到已渲染的用户消息。';
    case 'measuring': return `问题导航：${count}，正在测量布局。`;
    case 'visible': return `问题导航：${count}，面板已显示。`;
    case 'collapsed': return `问题导航：${count}，刻度模式已显示。`;
    case 'hidden': {
      const reason = {
        narrow: `窗口宽度 ${status.viewportWidth}px 不足 960px`,
        gutter: `左侧空隙 ${status.gutter}px 不足以显示导航（刻度需 60px，列表需 200px），请收起 ChatGPT 侧边栏或放大窗口`,
        height: '输入框或顶部区域占用较多空间，可用高度不足',
        'unknown-column': '无法确定消息列的位置', none: '尚未得到安全的显示位置',
      }[status.reason];
      return `问题导航：${count}，当前隐藏：${reason}。`;
    }
  }
}

export function describePageStatus(status: PageStatus, popupVersion: string): string {
  const lines = [`页面脚本：${status.version}（已连接）`];
  if (status.version !== popupVersion) lines.push('页面版本与扩展不一致，请刷新 ChatGPT。');
  if (status.phase === 'error') lines.push('设置读取失败，请刷新 ChatGPT 后重试。');
  else if (status.phase === 'loading') lines.push('页面设置仍在加载，请稍后重试。');
  lines.push(`Project Colors：${status.settings.projectColors ? status.projectReady ? '已开启' : '正在加载/读取失败' : '关闭'}`);
  lines.push(`Chat Colors：${status.settings.chatColors ? status.chatReady ? '已开启' : '正在加载/读取失败' : '关闭'}`);
  lines.push(`Codex Cloud Colors：${status.settings.codexCloudColors ? status.codexCloudReady ? '已开启' : '正在加载/读取失败' : '关闭'}`);
  lines.push(describeNavigation(status.navigation));
  lines.push(`识别到 ${status.projects} 个项目、${status.chats} 个聊天、${status.codexCloudTasks} 个 Codex 云端任务（${status.roots} 个侧边栏区域）。`);
  if (!status.settings.projectColors && !status.settings.chatColors && !status.settings.codexCloudColors) lines.push('颜色开关均关闭，右键会保留浏览器菜单。');
  else if (!status.roots) lines.push('未发现侧边栏，请展开 ChatGPT 侧边栏再检查。');
  const last = {
    none: '尚未收到右键；请在侧边栏条目上直接右键后再点检查。',
    project: '最近右键：已接管项目菜单。', chat: '最近右键：已接管聊天菜单。',
    'codex-cloud': '最近右键：已接管 Codex 云端任务菜单。',
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
