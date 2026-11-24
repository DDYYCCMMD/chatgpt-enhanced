import { chatColorStore } from '../../storage/chat-colors.ts';
import { colorFeature, enableSidebarColors } from '../../shared/sidebar-colors/lifecycle.ts';
import { discoverChats } from './detection.ts';

const adapter = { kind: 'chat' as const, discover: discoverChats, store: chatColorStore };
export const chatColors = colorFeature('chatColors', adapter);
export const enableChatColors = (document: Document, window: Window): (() => void) => enableSidebarColors(document, window, adapter);
