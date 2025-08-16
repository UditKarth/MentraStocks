/**
 * TypeScript type definitions for StockTracker application
 */

// Stock data interfaces
export interface Stock {
  ticker: string;
  price: number | null;
  changePercent: number | null;
  isPinned: boolean;
}

export interface StockApiResponse {
  price: number;
  changePercent: number;
}

// Timeframe options
export type Timeframe = '1D' | '1W' | '1M' | '1Y';

// Voice command types
export interface VoiceCommand {
  type: 'add' | 'remove' | 'pin' | 'alert' | 'help' | 'details';
  ticker?: string;
  price?: number;
  condition?: 'above' | 'below';
}

// API response types
export interface ApiStatus {
  app: string;
  version: string;
  timestamp: string;
  activeSessions: number;
  totalStocks: number;
  uptime: number;
  memory: NodeJS.MemoryUsage;
  mode?: 'mock' | 'live';
}

export interface UserWatchlistResponse {
  userId: string;
  watchlist: Stock[];
  count: number;
  timestamp: string;
  mode?: 'mock' | 'live';
}

// Tool call types for AI integration
export interface ToolCall {
  toolId: string;
  toolParameters: Record<string, any>;
  userId: string;
  timestamp: string;
}

// Global state types
export type UserWatchlists = Map<string, Stock[]>;
export type UserRefreshIntervals = Map<string, NodeJS.Timeout>;
export type UserCleanupFunctions = Map<string, Array<() => void>>;
