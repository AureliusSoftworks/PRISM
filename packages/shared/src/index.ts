export type UserRole = "user";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  theme: "light" | "dark";
  preferredProvider: "local" | "openai";
}

export interface AuthSession {
  userId: string;
  token: string;
  expiresAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface UserMemory {
  id: string;
  userId: string;
  createdAt: string;
  confidence: number;
  text: string;
}

export interface ChatRequestPayload {
  conversationId?: string;
  message: string;
}

export interface ChatResponsePayload {
  conversation: Conversation;
  assistantMessage: ChatMessage;
}
