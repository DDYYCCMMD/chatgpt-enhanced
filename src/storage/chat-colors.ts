import { createColorStore } from './color-store.ts';
import { isChatId } from '../features/chat-colors/detection.ts';

export const CHAT_COLOR_PREFIX = 'chatColors.v1.';
export const chatColorStore = createColorStore(CHAT_COLOR_PREFIX, isChatId);
export const { parse: parseChatColors, save: saveChatColor, observe: observeChatColors } = chatColorStore;
