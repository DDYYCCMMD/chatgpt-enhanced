import { projectColors } from '../features/project-colors/index.ts';
import { chatNavigation } from '../features/chat-navigation/index.ts';
import { createFeatureController } from '../shared/feature.ts';
import { observeSettings } from '../storage/settings.ts';

const controller = createFeatureController([projectColors, chatNavigation]);
let unsubscribe: (() => void) | undefined;

function start(): void {
  unsubscribe ??= observeSettings(
    (settings) => controller.apply(settings),
    () => console.warn('[ChatGPT Enhanced] Could not load feature settings. Reload the tab to retry.'),
  );
}

window.addEventListener('pagehide', () => {
  unsubscribe?.();
  unsubscribe = undefined;
  controller.dispose();
});
window.addEventListener('pageshow', start);
start();
