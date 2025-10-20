/**
 * Constants and configuration for StockTracker application
 */

// Environment variables
export const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
export const PACKAGE_NAME = process.env.PACKAGE_NAME;
export const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY;
export const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// App configuration
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'StockTracker';

// Default settings
export const DEFAULT_TIMEFRAME = '1D' as const;
export const DEFAULT_REFRESH_INTERVAL = 60; // seconds
export const DEFAULT_MAX_STOCKS = 5;
export const MIN_REFRESH_INTERVAL = 30; // seconds
export const MAX_REFRESH_INTERVAL = 300; // seconds
export const MIN_MAX_STOCKS = 1;
export const MAX_MAX_STOCKS = 10;

// Timeframe options
export const TIMEFRAME_OPTIONS = ['1D', '1W', '1M', '1Y'] as const;

// API configuration
export const API_TIMEOUT = 10000; // 10 seconds
export const API_RETRY_ATTEMPTS = 3;
export const API_RETRY_DELAY = 1000; // 1 second

// Display configuration
export const DISPLAY_DURATION = 5000; // 5 seconds
export const DASHBOARD_STAGGER_DELAY = 1000; // 1 second between cards

// Voice command patterns
export const VOICE_PATTERNS = {
  ACTIVATION: /stock\s+tracker/i,
  ADD_STOCK: /(?:add|focus\s+on)\s+([A-Z]{1,5})/i,
  REMOVE_STOCK: /remove\s+([A-Z]{1,5})/i,
  PIN_STOCK: /pin\s+([A-Z]{1,5})/i,
  PRICE_ALERT: /(?:alert\s+me|tell\s+me\s+when)\s+(?:if\s+)?([A-Z]{1,5})\s+(?:drops?\s+below|hits?)\s+(\d+(?:\.\d+)?)/i,
  SHOW_DETAILS: /(?:show\s+details|details\s+for)\s+([A-Z]{1,5})/i,
  HELP: /(?:help|what\s+can\s+you\s+do)/i,
} as const;

// Error messages
export const ERROR_MESSAGES = {
  MISSING_API_KEY: 'AUGMENTOS_API_KEY environment variable is required.',
  MISSING_PACKAGE_NAME: 'PACKAGE_NAME environment variable is required.',
  MISSING_ALPHA_VANTAGE_API_KEY: 'ALPHA_VANTAGE_API_KEY environment variable is required for Alpha Vantage API.',
  INVALID_TICKER: 'Invalid ticker symbol provided.',
  STOCK_NOT_FOUND: 'Stock not found in watchlist.',
  WATCHLIST_FULL: 'Watchlist is full. Remove a stock or pin important ones.',
  API_ERROR: 'Failed to fetch stock data.',
  INVALID_TIMEFRAME: 'Invalid timeframe provided.',
  INVALID_REFRESH_INTERVAL: 'Invalid refresh interval provided.',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  STOCK_ADDED: 'Stock added to watchlist.',
  STOCK_REMOVED: 'Stock removed from watchlist.',
  STOCK_PINNED: 'Stock pinned to watchlist.',
  SETTINGS_UPDATED: 'Settings updated successfully.',
} as const;

// Color codes for display
export const DISPLAY_COLORS = {
  GREEN: 'green',
  RED: 'red',
  GRAY: 'gray',
  YELLOW: 'yellow',
  BLUE: 'blue',
} as const;

// Symbols for display
export const DISPLAY_SYMBOLS = {
  UP_ARROW: '▲',
  DOWN_ARROW: '▼',
  PIN: '📌',
  LOADING: '⏳',
  SUCCESS: '✅',
  ERROR: '❌',
  INFO: 'ℹ️',
} as const;
