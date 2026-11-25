import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

export const FIRST_CONVERSATION = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
export const SECOND_CONVERSATION = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const fixture = readFileSync(new URL('../fixtures/conversation.html', import.meta.url), 'utf8');
const bubbleFixture = readFileSync(new URL('../fixtures/conversation-user-bubbles.html', import.meta.url), 'utf8');
export const bubbleNavigationDom = () => navigationDom(bubbleFixture);
export const settleNavigation = () => new Promise<void>((resolve) => setTimeout(resolve, 125));

export function navigationDom(markup = fixture) {
  const dom = new JSDOM(markup, { url: `https://chatgpt.com/c/${FIRST_CONVERSATION}`, pretendToBeVisual: true, runScripts: 'outside-only' });
  const { document } = dom.window;
  Object.defineProperty(dom.window, 'innerWidth', { value: 1920, writable: true });
  Object.defineProperty(dom.window, 'innerHeight', { value: 1000, writable: true });
  const scrollArea = document.getElementById('scroll-area')!;
  Object.defineProperty(scrollArea, 'scrollHeight', { value: 3200 });
  Object.defineProperty(scrollArea, 'clientHeight', { value: 700 });
  const scrolls: ScrollToOptions[] = [];
  scrollArea.scrollTo = ((options: ScrollToOptions) => { scrolls.push(options); scrollArea.scrollTop = options.top ?? 0; }) as typeof scrollArea.scrollTo;
  const windowScrolls: ScrollToOptions[] = [];
  dom.window.scrollTo = ((options: ScrollToOptions) => { windowScrolls.push(options); }) as typeof dom.window.scrollTo;
  const rect = (left: number, top: number, width: number, height: number): DOMRect => ({
    x: left, y: top, left, top, width, height, right: left + width, bottom: top + height, toJSON: () => ({}),
  });
  let columnLeft = 650;
  dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id === 'stage-sidebar') return rect(0, 0, 260, 1000);
    if (this.id === 'conversation-main') return rect(260, 0, dom.window.innerWidth - 260, 1000);
    if (this.tagName === 'HEADER') return rect(260, 0, 1660, 56);
    if (this.id === 'composer-background' || this.id === 'prompt-textarea') return rect(650, 820, 768, 100);
    if (this.classList.contains('max-w-thread')) return rect(columnLeft, 120, 768, 200);
    if (this.id.startsWith('turn-')) return rect(260, 140 + (Number(this.id.slice(5)) - 1) * 400 - scrollArea.scrollTop, 1660, 180);
    if (this.id.startsWith('user-')) return rect(1000, 140 + (Number(this.id.slice(5)) - 1) * 400 - scrollArea.scrollTop, 400, 120);
    return rect(260, 72, 1660, 700);
  };
  const mutations: { observing: boolean; targets: Node[]; subtreeTargets: Node[] }[] = [];
  const NativeMutation = dom.window.MutationObserver;
  class TrackingMutation extends NativeMutation {
    observing = false;
    targets: Node[] = [];
    subtreeTargets: Node[] = [];
    constructor(callback: MutationCallback) { super(callback); mutations.push(this); }
    observe(target: Node, options?: MutationObserverInit): void {
      this.observing = true; this.targets.push(target);
      if (options?.subtree) this.subtreeTargets.push(target);
      super.observe(target, options);
    }
    disconnect(): void { this.observing = false; this.targets = []; this.subtreeTargets = []; super.disconnect(); }
  }
  Object.defineProperty(dom.window, 'MutationObserver', { value: TrackingMutation });
  const intersections: FakeIntersection[] = [];
  class FakeIntersection {
    callback: IntersectionObserverCallback;
    options: IntersectionObserverInit | undefined;
    observed = new Set<Element>();
    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
      this.callback = callback; this.options = options; intersections.push(this);
    }
    observe(element: Element): void { this.observed.add(element); }
    disconnect(): void { this.observed.clear(); }
    trigger(): void { this.callback([], this as unknown as IntersectionObserver); }
  }
  Object.defineProperty(dom.window, 'IntersectionObserver', { value: FakeIntersection });
  const resizes: FakeResize[] = [];
  class FakeResize {
    observed = new Set<Element>();
    constructor() { resizes.push(this); }
    observe(element: Element): void { this.observed.add(element); }
    disconnect(): void { this.observed.clear(); }
  }
  Object.defineProperty(dom.window, 'ResizeObserver', { value: FakeResize });
  return { dom, document, window: dom.window as unknown as Window, scrollArea, scrolls, windowScrolls,
    mutations, intersections, resizes, setColumnLeft: (value: number) => { columnLeft = value; } };
}
