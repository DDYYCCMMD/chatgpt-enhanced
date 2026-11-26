export interface QuestionSummary {
  key: string;
  preview: string;
  tooltip: string;
  searchText: string;
  order: number;
  identityKeys?: readonly string[];
}

export interface Question extends QuestionSummary {
  message: HTMLElement;
  target: HTMLElement;
}

export interface IndexedQuestion extends QuestionSummary {
  position: number;
  // Session-only geometry. Storage validation deliberately omits this sample.
  positionSample?: { height: number; width: number };
}

export interface ConversationScope {
  main: HTMLElement;
  root: HTMLElement;
}
