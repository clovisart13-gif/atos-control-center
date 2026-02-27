// Atos Control Center — Tipos TypeScript

export interface Attachment {
  type: "image" | "pdf";
  url: string;
  name: string;
  /** URL local para preview (blob URL) */
  previewUrl?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  timestamp: number;
  /** Áudio foi transcrito */
  isTranscription?: boolean;
}

export interface WebhookPayload {
  user_id: string;
  message: string;
  attachments?: {
    type: "image" | "pdf";
    url: string;
  }[];
}

export interface WebhookResponse {
  reply: string;
}

export interface AudioRecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  /** Blob do áudio gravado */
  blob?: Blob;
}
