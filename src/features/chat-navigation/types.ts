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
}

export interface ConversationScope {
  main: HTMLElement;
  root: HTMLElement;
}
