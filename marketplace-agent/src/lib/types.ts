export type ProductStatus = 'DRAFT' | 'PUBLISHING' | 'ACTIVE' | 'FAILED' | 'PAUSED' | 'SOLD';
export type ListingStatus = ProductStatus;

export type ConversationStatus =
  | 'NEW'
  | 'QUESTION'
  | 'INTERESTED'
  | 'NEGOTIATING'
  | 'HOT_LEAD'
  | 'LOW_INTENT'
  | 'SPAM'
  | 'SOLD'
  | 'CLOSED';

export type MessageSender = 'BUYER' | 'AGENT' | 'HUMAN';
export type Platform = 'facebook' | 'mock';

export interface Product {
  id: string;
  userId: string;
  title: string;
  description: string;
  photos: string[];
  askingPrice: number;
  minimumPrice: number;
  pickupArea: string;
  availability: string;
  category: string;
  condition: string;
  status: ProductStatus;
  aiEnabled: boolean;
  generatedTitle: string | null;
  generatedDescription: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Listing {
  id: string;
  productId: string;
  platform: Platform;
  externalUrl: string | null;
  externalId: string | null;
  status: ListingStatus;
  errorMessage: string | null;
  screenshotPath: string | null;
  htmlPath: string | null;
  attempts: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  productId: string | null;
  platform: Platform;
  externalId: string;
  buyerName: string;
  status: ConversationStatus;
  leadScore: number;
  aiEnabled: boolean;
  agreedPrice: number | null;
  humanTakeover: boolean;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  externalId: string | null;
  sender: MessageSender;
  text: string;
  timestamp: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  conversationId: string;
  score: number;
  status: ConversationStatus;
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentEvent {
  id: string;
  type: string;
  level: 'info' | 'warn' | 'error';
  productId: string | null;
  conversationId: string | null;
  message: string;
  meta: string | null;
  createdAt: string;
}

export interface AgentState {
  running: boolean;
  mode: Platform;
  workerAlive: boolean;
  browserOpen: boolean;
  loggedIn: boolean;
  needsVerification: boolean;
  lastActivity: string | null;
  lastActivityAt: string | null;
  lastError: string | null;
  heartbeatAt: string | null;
}

export type AgentCommandType =
  | 'START_AGENT'
  | 'STOP_AGENT'
  | 'OPEN_BROWSER'
  | 'CLOSE_BROWSER'
  | 'PUBLISH_LISTING'
  | 'RETRY_LISTING'
  | 'CHECK_MESSAGES'
  | 'OPEN_CONVERSATION'
  | 'SEND_MESSAGE'
  | 'MARK_LISTING_SOLD';

export interface AgentCommand {
  id: string;
  type: AgentCommandType;
  payload: Record<string, unknown>;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  result: string | null;
  createdAt: string;
  updatedAt: string;
}
