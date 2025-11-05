

export enum TabId {
  CHAT = 'chat',
  PROMPT_LAB = 'prompt_lab',
  IMAGE = 'image',
  VIDEO = 'video',
  LIVE = 'live',
  TRANSCRIBE = 'transcribe',
  SCRIPT = 'script',
}

export interface Tab {
  id: TabId;
  label: string;
}

export interface TranscriptionEntry {
  speaker: 'user' | 'model';
  text: string;
}

export type ChatMode = 'low-latency' | 'thinking' | 'search-grounded';

export interface ChatMessage {
  id: string; // Add a unique ID for each message
  role: 'user' | 'model';
  parts: { text: string }[];
  imagePreview?: string; // Renamed from 'image' for clarity
  isStreaming?: boolean;
  groundingSources?: { uri: string; title: string }[];
}

export interface SavedConversation {
  id: string;
  name: string;
  timestamp: number;
  messages: ChatMessage[];
}