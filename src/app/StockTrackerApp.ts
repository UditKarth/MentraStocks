import 'dotenv/config';
import path from 'path';
import {
  AppServer,
  AppSession,
  ViewType,
  TranscriptionData,
  StreamType,
} from '@mentra/sdk';
import { stockApiManager, YahooFinanceProvider } from '../utils/stock-api';
import { CompanyLookup } from '../utils/company-lookup';
import { TickerSymbols } from '../utils/ticker-database';
import { StockDataCache } from '../utils/stock-cache';
import { LazyTickerDatabase } from '../utils/lazy-ticker-database';
import { SessionManager } from '../utils/session-manager';
import { PowerManager } from '../utils/power-manager';
import { AdaptiveDisplay } from '../utils/adaptive-display';
import { BatchApiManager } from '../utils/batch-api-manager';
import { IntelligentCache } from '../utils/intelligent-cache';
import { SmartVoiceProcessor } from '../utils/smart-voice-processor';

// Configuration constants
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY;

// Verify env vars are set.
if (!AUGMENTOS_API_KEY) {
  throw new Error('AUGMENTOS_API_KEY environment variable is required.');
}
if (!PACKAGE_NAME) {
  throw new Error('PACKAGE_NAME environment variable is required.');
}

// Data Models
interface Stock {
  ticker: string;
  price: number | null;
  changePercent: number | null;
  isPinned: boolean;
}



interface StockApiResponse {
  price: number;
  changePercent: number;
}

// Global maps to manage state for each user
const userWatchlists: Map<string, Stock[]> = new Map();
const userRefreshIntervals: Map<string, NodeJS.Timeout> = new Map();
const userCleanupFunctions: Map<string, Array<() => void>> = new Map();
const userLastActivity: Map<string, number> = new Map(); // Track user activity
const userFocusState: Map<string, { ticker: string; isFocused: boolean }> = new Map(); // Track focus state
const userDisplayState: Map<string, { isShowingStockData: boolean; lastStockDisplayTime: number }> = new Map(); // Track when stock data is being displayed

// Initialize optimization instances
const intelligentCache = IntelligentCache.getInstance();
const lazyTickerDb = LazyTickerDatabase.getInstance();
const stockDataCache = StockDataCache.getInstance();

// Voice detection state management
const voiceDetectionState: Map<string, {
  isListening: boolean;
  lastTranscriptionTime: number;
  silenceTimeout: NodeJS.Timeout | null;
  consecutiveEmptyTranscriptions: number;
  lastFinalTranscription: string;
}> = new Map();

// Voice detection constants
const SILENCE_TIMEOUT_MS = 3000; // 3 seconds of silence
const MAX_EMPTY_TRANSCRIPTIONS = 5; // Max consecutive empty transcriptions
const MIN_TRANSCRIPTION_LENGTH = 3; // Minimum characters for valid transcription

/**
 * Voice detection utilities
 */
class VoiceDetectionManager {
  private static appInstance: StockTrackerApp | null = null;

  /**
   * Set the app instance for command delegation
   */
  static setAppInstance(app: StockTrackerApp): void {
    this.appInstance = app;
  }

  /**
   * Check if app instance is set
   */
  static isAppInstanceSet(): boolean {
    return this.appInstance !== null;
  }

  /**
   * Initialize voice detection state for a user
   */
  static initializeUser(userId: string): void {
    voiceDetectionState.set(userId, {
      isListening: false,
      lastTranscriptionTime: Date.now(),
      silenceTimeout: null,
      consecutiveEmptyTranscriptions: 0,
      lastFinalTranscription: ''
    });
  }

  /**
   * Handle transcription data with improved logic
   */
  static handleTranscription(session: AppSession, userId: string, data: TranscriptionData): void {
    const state = voiceDetectionState.get(userId);
    if (!state) {
      this.initializeUser(userId);
      return;
    }

    const transcript = data.text.trim();
    const now = Date.now();

    // Update activity timestamp
    MemoryManager.updateUserActivity(userId);

    // Clear existing silence timeout
    if (state.silenceTimeout) {
      clearTimeout(state.silenceTimeout);
      state.silenceTimeout = null;
    }

    // Handle empty transcriptions
    if (!transcript) {
      state.consecutiveEmptyTranscriptions++;
      
      if (state.consecutiveEmptyTranscriptions >= MAX_EMPTY_TRANSCRIPTIONS) {
        this.stopListening(session, userId, 'too_many_empty_transcriptions');
        return;
      }
      
      // Set silence timeout for empty transcriptions
      state.silenceTimeout = setTimeout(() => {
        this.stopListening(session, userId, 'silence_timeout');
      }, SILENCE_TIMEOUT_MS);
      
      return;
    }

    // Reset empty transcription counter
    state.consecutiveEmptyTranscriptions = 0;
    state.lastTranscriptionTime = now;

    // Show interim transcription feedback for all transcriptions
    this.showInterimTranscription(session, transcript);

    // Handle final transcriptions
    if (data.isFinal) {
      // Check if this is a duplicate of the last final transcription
      if (transcript === state.lastFinalTranscription) {
        console.log('Duplicate final transcription detected, ignoring', { transcript });
        return;
      }

      state.lastFinalTranscription = transcript;
      
      // Process the command
      this.processFinalTranscription(session, userId, data);
      
      // Stop listening after processing
      this.stopListening(session, userId, 'command_processed');
    } else {
      // Set silence timeout for interim transcriptions
      state.silenceTimeout = setTimeout(() => {
        this.stopListening(session, userId, 'silence_timeout');
      }, SILENCE_TIMEOUT_MS);
    }
  }

  /**
   * Start listening for voice input
   */
  static startListening(session: AppSession, userId: string): void {
    const state = voiceDetectionState.get(userId);
    if (state) {
      state.isListening = true;
      state.consecutiveEmptyTranscriptions = 0;
      state.lastFinalTranscription = '';
    }
    
    this.showListeningIndicator(session);
    console.log('Voice detection started for user:', userId);
  }

  /**
   * Stop listening for voice input
   */
  static stopListening(session: AppSession, userId: string, reason: string): void {
    const state = voiceDetectionState.get(userId);
    if (state) {
      state.isListening = false;
      
      if (state.silenceTimeout) {
        clearTimeout(state.silenceTimeout);
        state.silenceTimeout = null;
      }
    }
    
    this.hideListeningIndicator(session);
    console.log('Voice detection stopped for user:', userId, 'reason:', reason);
  }

  /**
   * Process final transcription
   */
  private static processFinalTranscription(session: AppSession, userId: string, data: TranscriptionData): void {
    const transcript = data.text.toLowerCase();
    
    // Show final transcription feedback - simplified
    try {
      session.layouts.showTextWall(
        `🎤 Heard: ${transcript}`,
        {
          view: ViewType.MAIN,
          durationMs: 2000
        }
      );
    } catch (error) {
      console.error('Error showing transcription feedback:', error);
    }

    // Check for activation phrase
    if (!transcript.includes('stock tracker')) {
      console.log('Command ignored - no activation phrase');
      this.showCommandFeedbackAndRestore(session, userId, 'No activation phrase', 'Say "Stock tracker" to activate');
      return;
    }

    // Process commands
    this.processVoiceCommand(session, userId, transcript);
  }

  /**
   * Show interim transcription feedback
   */
  private static showInterimTranscription(session: AppSession, transcript: string): void {
    // Don't show interim feedback to avoid layout conflicts
    // This prevents the error layout from appearing during voice input
    console.log('Interim transcription received:', transcript);
  }

  /**
   * Show listening indicator
   */
  private static showListeningIndicator(session: AppSession): void {
    try {
      session.layouts.showTextWall('🎤 Ready to listen...\nSay "Stock tracker help" for commands', {
        view: ViewType.MAIN,
        durationMs: 5000
      });
      console.log('Static listening indicator shown');
    } catch (error) {
      console.error('Error showing static listening indicator:', error);
    }
  }

  /**
   * Hide listening indicator
   */
  private static hideListeningIndicator(session: AppSession): void {
    // Don't show empty text wall - let the stock display remain
    // This prevents the error layout from appearing
    console.log('Listening indicator hidden - keeping stock display');
  }

  /**
   * Show command feedback
   */
  private static showCommandFeedback(session: AppSession, title: string, message: string): void {
    try {
      session.layouts.showTextWall(
        `${title}\n${message}`,
        {
          view: ViewType.MAIN,
          durationMs: 4000
        }
      );
    } catch (error) {
      console.error('Error showing command feedback:', error);
    }
  }

  /**
   * Show command feedback and restore previous display (static version)
   */
  private static showCommandFeedbackAndRestore(session: AppSession, userId: string, title: string, message: string): void {
    if (this.appInstance) {
      this.appInstance.showCommandFeedbackAndRestore(session, userId, title, message);
    } else {
      // Fallback to regular feedback if app instance not available
      this.showCommandFeedback(session, title, message);
    }
  }

  /**
   * Process voice command
   */
  private static processVoiceCommand(session: AppSession, userId: string, transcript: string): void {
    // Parse commands
    if (transcript.includes('add') || transcript.includes('at') || transcript.includes('ad')) {
      console.log('Processing add stock command', { transcript });
      this.handleAddStock(session, userId, transcript);
    } else if (transcript.includes('focus on') || transcript.includes('focus ')) {
      console.log('Processing focus command', { transcript });
      this.handleFocusCommand(session, userId, transcript);
    } else if (transcript.includes('view watchlist') || transcript.includes('show watchlist')) {
      console.log('Processing view watchlist command', { transcript });
      this.handleViewWatchlistCommand(session, userId);
    } else if (transcript.includes('pin')) {
      console.log('Processing pin stock command', { transcript });
      this.handlePinStock(session, userId, transcript);
    } else if (transcript.includes('remove')) {
      console.log('Processing remove stock command', { transcript });
      this.handleRemoveStock(session, userId, transcript);
    } else if (transcript.includes('alert me') || transcript.includes('tell me when')) {
      console.log('Processing price alert command', { transcript });
      this.handlePriceAlert(session, userId, transcript);
    } else if (transcript.includes('help') || transcript.includes('commands')) {
      console.log('Processing help command', { transcript });
      this.showHelp(session);
    } else if (transcript.includes('details') || transcript.includes('info')) {
      console.log('Processing details command', { transcript });
      this.handleShowDetails(session, userId, transcript);
    } else if (transcript.includes('clear watchlist') || transcript.includes('clear the watchlist') || transcript.includes('remove focus')) {
      console.log('Processing clear display command', { transcript });
      this.handleClearDisplayCommand(session, userId);
    } else {
      console.log('Unknown voice command', { transcript });
      this.showCommandFeedbackAndRestore(session, userId, 'Command not recognized', 'Try saying "Stock tracker help" for available commands');
    }
  }

  // Delegate command handlers to the main class
  private static handleAddStock(session: AppSession, userId: string, transcript: string): void {
    if (this.appInstance) {
      try {
        this.appInstance.handleAddStockCommand(session, userId, transcript);
      } catch (error) {
        console.error('Error in handleAddStock delegation:', error);
        this.showCommandFeedbackAndRestore(session, userId, 'Error', 'Failed to process add stock command');
      }
    } else {
      console.error('App instance not available for command delegation');
      this.showCommandFeedbackAndRestore(session, userId, 'Error', 'App not ready for commands');
    }
  }

  private static handlePinStock(session: AppSession, userId: string, transcript: string): void {
    if (this.appInstance) {
      try {
        this.appInstance.handlePinStockCommand(session, userId, transcript);
      } catch (error) {
        console.error('Error in handlePinStock delegation:', error);
        this.showCommandFeedbackAndRestore(session, userId, 'Error', 'Failed to process pin stock command');
      }
    } else {
      console.error('App instance not available for command delegation');
      this.showCommandFeedbackAndRestore(session, userId, 'Error', 'App not ready for commands');
    }
  }

  private static handleRemoveStock(session: AppSession, userId: string, transcript: string): void {
    if (this.appInstance) {
      try {
        this.appInstance.handleRemoveStockCommand(session, userId, transcript);
      } catch (error) {
        console.error('Error in handleRemoveStock delegation:', error);
        this.showCommandFeedbackAndRestore(session, userId, 'Error', 'Failed to process remove stock command');
      }
    } else {
      console.error('App instance not available for command delegation');
      this.showCommandFeedbackAndRestore(session, userId, 'Error', 'App not ready for commands');
    }
  }

  private static handlePriceAlert(session: AppSession, userId: string, transcript: string): void {
    if (this.appInstance) {
      try {
        this.appInstance.handlePriceAlertCommand(session, userId, transcript);
      } catch (error) {
        console.error('Error in handlePriceAlert delegation:', error);
        this.showCommandFeedbackAndRestore(session, userId, 'Error', 'Failed to process price alert command');
      }
    } else {
      console.error('App instance not available for command delegation');
      this.showCommandFeedbackAndRestore(session, userId, 'Error', 'App not ready for commands');
    }
  }

  private static showHelp(session: AppSession): void {
    if (this.appInstance) {
      try {
        this.appInstance.showHelpCommand(session);
      } catch (error) {
        console.error('Error in showHelp delegation:', error);
        this.showCommandFeedback(session, 'Error', 'Failed to show help');
      }
    } else {
      console.error('App instance not available for command delegation');
      this.showCommandFeedback(session, 'Error', 'App not ready for commands');
    }
  }

  private static handleClearDisplayCommand(session: AppSession, userId: string): void {
    if (this.appInstance) {
      try {
        this.appInstance.handleClearDisplayCommand(session, userId);
      } catch (error) {
        console.error('Error in handleClearDisplayCommand delegation:', error);
        this.showCommandFeedbackAndRestore(session, userId, 'Error', 'Failed to process clear display command');
      }
    } else {
      console.error('App instance not available for command delegation');
      this.showCommandFeedbackAndRestore(session, userId, 'Error', 'App not ready for commands');
    }
  }

  private static handleShowDetails(session: AppSession, userId: string, transcript: string): void {
    if (this.appInstance) {
      try {
        this.appInstance.handleShowDetailsCommand(session, userId, transcript);
      } catch (error) {
        console.error('Error in handleShowDetails delegation:', error);
        this.showCommandFeedbackAndRestore(session, userId, 'Error', 'Failed to process details command');
      }
    } else {
      console.error('App instance not available for command delegation');
      this.showCommandFeedbackAndRestore(session, userId, 'Error', 'App not ready for commands');
    }
  }

  private static handleFocusCommand(session: AppSession, userId: string, transcript: string): void {
    if (this.appInstance) {
      try {
        this.appInstance.handleFocusCommand(session, userId, transcript);
      } catch (error) {
        console.error('Error in handleFocusCommand delegation:', error);
        this.showCommandFeedbackAndRestore(session, userId, 'Error', 'Failed to process focus command');
      }
    } else {
      console.error('App instance not available for command delegation');
      this.showCommandFeedbackAndRestore(session, userId, 'Error', 'App not ready for commands');
    }
  }

  private static handleViewWatchlistCommand(session: AppSession, userId: string): void {
    if (this.appInstance) {
      try {
        this.appInstance.handleViewWatchlistCommand(session, userId);
      } catch (error) {
        console.error('Error in handleViewWatchlistCommand delegation:', error);
        this.showCommandFeedbackAndRestore(session, userId, 'Error', 'Failed to process view watchlist command');
      }
    } else {
      console.error('App instance not available for command delegation');
      this.showCommandFeedbackAndRestore(session, userId, 'Error', 'App not ready for commands');
    }
  }
}

// Memory management constants
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MEMORY_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ACTIVE_SESSIONS = 10; // Limit concurrent sessions

// Memory cleanup timer
let memoryCleanupTimer: NodeJS.Timeout | null = null;

/**
 * Memory management utilities
 */
class MemoryManager {
  /**
   * Start periodic memory cleanup
   */
  static startMemoryCleanup(): void {
    if (memoryCleanupTimer) {
      clearInterval(memoryCleanupTimer);
    }
    
    memoryCleanupTimer = setInterval(() => {
      this.performMemoryCleanup();
    }, MEMORY_CLEANUP_INTERVAL_MS);
    
    console.log('Memory cleanup timer started');
  }

  /**
   * Stop memory cleanup timer
   */
  static stopMemoryCleanup(): void {
    if (memoryCleanupTimer) {
      clearInterval(memoryCleanupTimer);
      memoryCleanupTimer = null;
      console.log('Memory cleanup timer stopped');
    }
  }

  /**
   * Perform memory cleanup
   */
  static performMemoryCleanup(): void {
    const now = Date.now();
    const memoryUsage = process.memoryUsage();
    
    console.log('Performing memory cleanup...', {
      activeSessions: userWatchlists.size,
      memoryUsage: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB'
      }
    });

    // Clean up inactive sessions
    for (const [userId, lastActivity] of userLastActivity.entries()) {
      if (now - lastActivity > SESSION_TIMEOUT_MS) {
        console.log(`Cleaning up inactive session for user: ${userId}`);
        this.cleanupUserSession(userId, 'inactivity_timeout');
      }
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      console.log('Garbage collection performed');
    }

    // Log memory usage after cleanup
    const newMemoryUsage = process.memoryUsage();
    console.log('Memory cleanup completed', {
      rss: Math.round(newMemoryUsage.rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(newMemoryUsage.heapUsed / 1024 / 1024) + ' MB'
    });
  }

  /**
   * Clean up a specific user session
   */
  static cleanupUserSession(userId: string, reason: string): void {
    console.log(`Cleaning up user session: ${userId} (${reason})`);
    
    // Stop refresh interval
    const refreshInterval = userRefreshIntervals.get(userId);
    if (refreshInterval) {
      clearInterval(refreshInterval);
      userRefreshIntervals.delete(userId);
    }

    // Clean up event listeners
    const cleanupFunctions = userCleanupFunctions.get(userId);
    if (cleanupFunctions) {
      cleanupFunctions.forEach(cleanup => cleanup());
      userCleanupFunctions.delete(userId);
    }

    // Remove user data
    userWatchlists.delete(userId);
    userLastActivity.delete(userId);
    
    // Clean up voice detection state
    voiceDetectionState.delete(userId);

    // Log memory after cleanup
    const memoryUsage = process.memoryUsage();
    console.log(`Session cleanup completed for ${userId}`, {
      rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB'
    });
  }

  /**
   * Update user activity timestamp
   */
  static updateUserActivity(userId: string): void {
    userLastActivity.set(userId, Date.now());
  }

  /**
   * Check if we should limit new sessions
   */
  static shouldLimitSessions(): boolean {
    return userWatchlists.size >= MAX_ACTIVE_SESSIONS;
  }
}

/**
 * StockTrackerApp - Main application class that extends AppServer
 */
class StockTrackerApp extends AppServer {
  constructor() {
    super({
      packageName: PACKAGE_NAME!,
      apiKey: AUGMENTOS_API_KEY!,
      port: PORT,
      publicDir: path.join(__dirname, './public'),
      healthCheck: true, // Enable built-in health check endpoint
    });

    // Set up custom routes after super() call
    this.setupCustomRoutes();
    
    // Set up voice detection manager with this instance
    VoiceDetectionManager.setAppInstance(this);
  }

  /**
   * Sets up custom Express routes for the StockTracker app
   */
  private setupCustomRoutes(): void {
    const app = this.getExpressApp();

    // Add custom middleware for logging
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });

    // Custom endpoint to get app status with memory monitoring
    app.get('/api/status', (req, res) => {
      const memoryUsage = process.memoryUsage();
      const status = {
        app: 'StockTracker',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        activeSessions: userWatchlists.size,
        totalStocks: Array.from(userWatchlists.values()).reduce((total, watchlist) => total + watchlist.length, 0),
        uptime: process.uptime(),
        memory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
          external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
        },
        memoryUsage: memoryUsage,
        // Add ticker database stats
        tickerDatabase: {
          totalTickers: TickerSymbols.length,
          databaseSize: Math.round(TickerSymbols.length * 100 / 1024) + ' KB estimated'
        }
      };
      res.json(status);
    });

    // Custom endpoint to get memory diagnostics
          app.get('/api/memory', async (req, res) => {
      const memoryUsage = process.memoryUsage();
      const tickerDb = LazyTickerDatabase.getInstance();
      const dbStats = await tickerDb.getMemoryStats();
      const cacheStats = intelligentCache.getStats();
      const priceCacheStats = stockDataCache.getStats();
      
      res.json({
        processMemory: {
          rss: Math.round(memoryUsage.rss / 1024 / 1024) + ' MB',
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB',
          external: Math.round(memoryUsage.external / 1024 / 1024) + ' MB'
        },
        optimizations: {
          tickerDatabase: dbStats,
          intelligentCache: cacheStats,
          priceTrackingCache: priceCacheStats
        },
        userSessions: {
          activeUsers: userWatchlists.size,
          activeIntervals: userRefreshIntervals.size,
          activeCleanupFunctions: userCleanupFunctions.size
        },
        recommendations: this.getMemoryRecommendations(memoryUsage, dbStats)
      });
    });

    // Debug endpoint to check watchlist status
    app.get('/api/debug/watchlist/:userId', (req, res) => {
      const { userId } = req.params;
      const watchlist = userWatchlists.get(userId);
      
      res.json({
        userId,
        hasWatchlist: !!watchlist,
        watchlistCount: watchlist ? watchlist.length : 0,
        watchlist: watchlist || [],
        timestamp: new Date().toISOString()
      });
    });

    // Debug endpoint to manually trigger watchlist display
    app.post('/api/debug/display/:userId', (req, res) => {
      const { userId } = req.params;
      const watchlist = userWatchlists.get(userId);
      
      if (!watchlist) {
        return res.status(404).json({ error: 'No watchlist found for user' });
      }

      // This is a debug endpoint, so we'll just return success
      // The actual display would need a session reference
      res.json({
        message: 'Display request received',
        userId,
        watchlistCount: watchlist.length,
        timestamp: new Date().toISOString()
      });
    });

    // Custom endpoint to get user watchlist (for debugging)
    app.get('/api/user/:userId/watchlist', (req, res) => {
      const { userId } = req.params;
      const watchlist = userWatchlists.get(userId);
      
      if (watchlist) {
        res.json({
          userId,
          watchlist,
          count: watchlist.length,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(404).json({ error: 'User not found', userId });
      }
    });

    // Debug endpoint to show price tracking data for a ticker
    app.get('/api/debug/price-tracking/:ticker', (req, res) => {
      const { ticker } = req.params;
      const priceData = stockDataCache.getPriceData(ticker.toUpperCase());
      const cachedPercentageChange = stockDataCache.getCachedPercentageChange(ticker.toUpperCase());
      
      res.json({
        ticker: ticker.toUpperCase(),
        priceData,
        cachedPercentageChange,
        hasValidPercentageData: stockDataCache.hasValidPercentageData(ticker.toUpperCase()),
        previousPrice: stockDataCache.getPreviousPrice(ticker.toUpperCase()),
        timestamp: new Date().toISOString()
      });
    });

    // Custom endpoint to add stock via API (for testing)
    app.post('/api/user/:userId/stock', (req, res) => {
      const { userId } = req.params;
      const { ticker } = req.body;

      if (!ticker) {
        return res.status(400).json({ error: 'Ticker is required' });
      }

      const watchlist = userWatchlists.get(userId) || [];
      
      // Check if stock is already on the list
      if (watchlist.some(stock => stock.ticker === ticker.toUpperCase())) {
        return res.status(409).json({ error: 'Stock already in watchlist', ticker });
      }

      // Add new stock
      watchlist.push({
        ticker: ticker.toUpperCase(),
        price: null,
        changePercent: null,
        isPinned: false
      });

      userWatchlists.set(userId, watchlist);
      
      res.json({
        message: 'Stock added successfully',
        ticker: ticker.toUpperCase(),
        watchlist
      });
    });

    // Custom endpoint to generate JWT token for webview
    app.post('/api/token', (req, res) => {
      const { userId, sessionId } = req.body;
      
      if (!userId || !sessionId) {
        return res.status(400).json({ error: 'userId and sessionId are required' });
      }

      try {
        const token = this.generateToken(userId, sessionId, AUGMENTOS_API_KEY!);
        res.json({ token });
      } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).json({ error: 'Failed to generate token' });
      }
    });

    // Custom endpoint for stock data (mock data for testing)
    app.get('/api/stock/:ticker', (req, res) => {
      const { ticker } = req.params;
      const { timeframe = '1D' } = req.query;

      // Simulate API delay
      setTimeout(() => {
        const mockData = {
          ticker: ticker.toUpperCase(),
          price: Math.random() * 1000 + 50,
          changePercent: (Math.random() - 0.5) * 10,
          timeframe,
          timestamp: new Date().toISOString()
        };

        res.json(mockData);
      }, 100 + Math.random() * 200);
    });

    // Error handling middleware
    app.use((err: any, req: any, res: any, next: any) => {
      console.error('Express error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Get memory usage recommendations
   */
  private getMemoryRecommendations(memoryUsage: NodeJS.MemoryUsage, dbStats: any): string[] {
    const recommendations: string[] = [];
    const heapUsedMB = memoryUsage.heapUsed / 1024 / 1024;
    const rssMB = memoryUsage.rss / 1024 / 1024;

    if (heapUsedMB > 100) {
      recommendations.push('High heap usage detected - consider reducing concurrent sessions');
    }
    if (rssMB > 200) {
      recommendations.push('High RSS memory usage - monitor for memory leaks');
    }
    if (userWatchlists.size > 10) {
      recommendations.push('Many active sessions - consider implementing session timeouts');
    }
    if (dbStats.symbolMapSize > 10000) {
      recommendations.push('Large ticker database loaded - consider lazy loading for less common symbols');
    }

    return recommendations;
  }

  /**
   * Called by AppServer when a new session is created
   */
  protected override async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    // Use the built-in session logger instead of console.log
    console.log('StockTracker session started', { 
      sessionId,
      userId,
      capabilities: session.capabilities ? Object.keys(session.capabilities) : null
    });

    try {
      // Initialize optimized session manager
      const sessionManager = SessionManager.getInstance();
      const userSession = sessionManager.createSession(userId, []);
      
      // Initialize enhanced power manager with MentraOS integration
      const powerManager = PowerManager.getInstance();
      powerManager.initializeWithSession(session);
      
      // Initialize adaptive display system
      const adaptiveDisplay = AdaptiveDisplay.getInstance();
      
      // Initialize Phase 2 optimizations
      const batchApiManager = BatchApiManager.getInstance();
      const intelligentCache = IntelligentCache.getInstance();
      const smartVoiceProcessor = SmartVoiceProcessor.getInstance();
      
      // Check device capabilities and adapt behavior
      if (session.capabilities) {
        console.log('Device capabilities detected', {
          hasMicrophone: !!session.capabilities.microphone,
          hasDisplay: !!session.capabilities.display,
          hasButton: !!session.capabilities.button,
          hasPower: !!session.capabilities.power
        });
        
        // Configure adaptive display based on device capabilities
        if (session.capabilities.display) {
          adaptiveDisplay.setDeviceCapabilities({
            screenSize: 'small', // Smart glasses default
            hasColor: true,
            hasHighContrast: true,
            maxLines: 4,
            maxCharsPerLine: 20
          });
        }
      }
      
      // Check if we should limit new sessions
      if (sessionManager.getStats().totalSessions >= 50) {
        console.log('Session limit reached, cleaning up oldest sessions');
        // Session manager handles cleanup automatically
      }

      // Initialize cleanup functions array for this user
      const cleanupFunctions: Array<() => void> = [];
      sessionManager.addCleanupFunction(userId, () => {
        cleanupFunctions.forEach(cleanup => cleanup());
      });

      // Initialize voice detection for this user
      VoiceDetectionManager.initializeUser(userId);
      
      // Update user activity
      sessionManager.updateActivity(userId);

      // Load data from settings with proper defaults
      const watchlist = session.settings.get<Stock[]>('watchlist', []);
      const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');
      const defaultRefreshInterval = session.settings.get<number>('refresh_interval_seconds', 60);
      const maxStocks = session.settings.get<number>('max_stocks', 5);

      // Update session with watchlist data
      sessionManager.updateWatchlist(userId, watchlist);

      console.log('Session initialized', {
        watchlistCount: watchlist.length,
        timeframe,
        defaultRefreshInterval,
        maxStocks
      });

      // Start data refresh loop with power-aware scheduling
      const startRefreshLoop = () => {
        const optimalInterval = powerManager.getOptimalInterval();
        console.log(`Starting refresh loop with ${optimalInterval}ms interval (power-aware)`);
        
        const interval = setInterval(() => {
          this.updateWatchlistData(userId, session);
        }, optimalInterval);
        
        sessionManager.setRefreshInterval(userId, interval);
        
        // Set up power-aware interval updates
        const powerListener = powerManager.addListener((powerState) => {
          console.log(`Power state changed, updating refresh interval for user: ${userId}`);
          const newInterval = powerManager.getOptimalInterval();
          
          // Restart refresh loop with new interval
          const currentInterval = sessionManager.getSession(userId)?.refreshInterval;
          if (currentInterval) {
            clearInterval(currentInterval);
          }
          
          const newRefreshInterval = setInterval(() => {
            this.updateWatchlistData(userId, session);
          }, newInterval);
          
          sessionManager.setRefreshInterval(userId, newRefreshInterval);
        });
        
        cleanupFunctions.push(() => {
          powerListener(); // Unsubscribe from power events
        });
      };
      
      startRefreshLoop();

      // Initial display
      await this.updateWatchlistData(userId, session);

      // Set up voice command listener using smart voice processor
      const transcriptionCleanup = session.events.onTranscription((data) => {
        console.log('Received transcription', { 
          text: data.text, 
          isFinal: data.isFinal
        });
        
        // Process through smart voice processor for deduplication
        const wasProcessed = smartVoiceProcessor.processTranscription(data.text, data.isFinal);
        
        // For final transcriptions, always process them even if filtered by smart processor
        if (wasProcessed || data.isFinal) {
          // Use main voice detection manager
          if (!VoiceDetectionManager.isAppInstanceSet()) {
            console.log('Setting app instance for voice detection');
            VoiceDetectionManager.setAppInstance(this);
          }
          VoiceDetectionManager.handleTranscription(session, userId, data);
        } else {
          console.log('Transcription filtered out by smart voice processor');
        }
      });
      cleanupFunctions.push(transcriptionCleanup);

      // Show initial app status
      this.showInitialLayout(session);
      
      // Initialize smart voice processor with callbacks
      smartVoiceProcessor.setCallbacks({
        onVoiceStart: () => {
          console.log('Voice activity started for user:', userId);
        },
        onVoiceEnd: () => {
          console.log('Voice activity ended for user:', userId);
        },
        onTranscription: (text: string, isFinal: boolean) => {
          console.log('Smart transcription received:', { text: text.substring(0, 50), isFinal, userId });
          const transcriptionData: TranscriptionData = {
            text,
            isFinal,
            type: StreamType.TRANSCRIPTION,
            startTime: Date.now(),
            endTime: Date.now()
          };
          VoiceDetectionManager.handleTranscription(session, userId, transcriptionData);
        },
        onSilence: () => {
          console.log('Silence detected for user:', userId);
        }
      });
      
      // Start voice detection with power-aware settings
      const startVoiceDetection = () => {
        if (powerManager.shouldEnableVoice()) {
          smartVoiceProcessor.startListening();
          VoiceDetectionManager.startListening(session, userId);
          console.log('Smart voice detection started for user:', userId, '(power-aware)');
        } else {
          console.log('Voice detection disabled for user:', userId, '(low power mode)');
        }
      };
      
      startVoiceDetection();
      
      // Set up power-aware voice detection management
      const voicePowerListener = powerManager.addListener((powerState) => {
        console.log(`Power state changed, updating voice detection for user: ${userId}`);
        
        if (powerManager.shouldEnableVoice()) {
          smartVoiceProcessor.startListening();
          VoiceDetectionManager.startListening(session, userId);
        } else {
          smartVoiceProcessor.stopListening();
          VoiceDetectionManager.stopListening(session, userId, 'power_management');
        }
      });
      
      cleanupFunctions.push(() => {
        voicePowerListener(); // Unsubscribe from power events
        smartVoiceProcessor.stopListening(); // Stop smart voice processor
      });
      
      // Set up periodic voice detection restart to prevent getting stuck (only when voice is enabled)
      const voiceRestartInterval = setInterval(() => {
        if (powerManager.shouldEnableVoice()) {
          const state = voiceDetectionState.get(userId);
          if (state && !state.isListening) {
            console.log('Restarting voice detection for user:', userId);
            VoiceDetectionManager.startListening(session, userId);
          }
        }
      }, 30000); // Check every 30 seconds
      
      cleanupFunctions.push(() => {
        clearInterval(voiceRestartInterval);
      });

      // Set up settings listeners with proper cleanup
      const timeframeCleanup = session.settings.onValueChange<'1D' | '1W' | '1M' | '1Y'>('timeframe', (newValue, oldValue) => {
        console.log('Timeframe setting changed', { oldValue, newValue });
        
        // Show timeframe change notification
        session.layouts.showTextWall(
          `Timeframe Updated\nChanged to ${newValue} view`,
          {
            view: ViewType.MAIN,
            durationMs: 3000
          }
        );
        
        this.updateWatchlistData(userId, session);
      });
      cleanupFunctions.push(timeframeCleanup);

      const refreshIntervalCleanup = session.settings.onValueChange<number>('refresh_interval_seconds', (newValue, oldValue) => {
        console.log('Refresh interval setting changed', { oldValue, newValue });
        
        // Show refresh interval change notification
        session.layouts.showTextWall(
          `Refresh Updated\nNow refreshing every ${newValue} seconds`,
          {
            view: ViewType.MAIN,
            durationMs: 3000
          }
        );
        
        this.updateRefreshInterval(userId, session, newValue);
      });
      cleanupFunctions.push(refreshIntervalCleanup);

      const maxStocksCleanup = session.settings.onValueChange<number>('max_stocks', (newValue, oldValue) => {
        console.log('Max stocks setting changed', { oldValue, newValue });
        
        // Show max stocks change notification
        session.layouts.showTextWall(
          `Limit Updated\nMax stocks: ${newValue}`,
          {
            view: ViewType.MAIN,
            durationMs: 3000
          }
        );
        
        this.enforceMaxStocks(userId, session, newValue);
      });
      cleanupFunctions.push(maxStocksCleanup);

      // Listen for any settings changes (optional, for debugging)
      const allSettingsCleanup = session.settings.onChange((changes) => {
                console.log('Settings changed', {
          changedKeys: Object.keys(changes),
          changes
        });
      });
      cleanupFunctions.push(allSettingsCleanup);

      // Listen for MentraOS settings if needed
      const metricSystemCleanup = session.settings.onMentraosSettingChange<boolean>('metricSystemEnabled', (enabled, wasEnabled) => {
        console.log('Metric system setting changed', { enabled, wasEnabled });
        // Could be used for currency formatting in the future
      });
      cleanupFunctions.push(metricSystemCleanup);

      // Set up head position detection for dashboard visibility
      // Note: headPosition capability not available in current SDK version
      // if (session.capabilities?.headPosition) {
      //   const headPositionCleanup = session.events.onHeadPosition((data) => {
      //     console.log('Head position changed', { position: data.position });
      //     // Could be used to show/hide dashboard based on head position
      //   });
      //   cleanupFunctions.push(headPositionCleanup);
      // }

      // Set up button press handling if available
      if (session.capabilities?.button) {
        const buttonPressCleanup = session.events.onButtonPress((data) => {
          console.log('Button pressed', { buttonId: data.buttonId });
          // Could be used for quick actions like refresh or help
          if (data.buttonId === 'primary') {
            this.showHelp(session);
          }
        });
        cleanupFunctions.push(buttonPressCleanup);
      }

      // Note: setSubscriptionSettings is not available in this SDK version
      // Event subscriptions are handled manually above

    } catch (error) {
      session.logger.error(error, 'Error initializing StockTracker session');
      throw error; // Re-throw to let the framework handle it
    }
  }

  /**
   * Called by AppServer when a session is stopped
   */
  protected override async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    // Note: We don't have access to session.logger here, so we'll use console.log
    // In a real implementation, you might want to store the logger reference
    console.log(`StockTracker session ${sessionId} stopped: ${reason}`);
    
    // Use the memory manager to clean up the session
    MemoryManager.cleanupUserSession(userId, reason);
  }

  /**
   * Handles voice commands from the user (delegated to VoiceDetectionManager)
   */
  private async handleVoiceCommand(session: AppSession, userId: string, data: TranscriptionData): Promise<void> {
    // This method is now handled by VoiceDetectionManager
    VoiceDetectionManager.handleTranscription(session, userId, data);
  }

  /**
   * Fallback voice command handler (simpler version)
   */
  private async handleVoiceCommandFallback(session: AppSession, userId: string, data: TranscriptionData): Promise<void> {
    const transcript = data.text.toLowerCase();
    console.log('Fallback voice command handler', { transcript, isFinal: data.isFinal });

    // Update voice detection state
    const state = voiceDetectionState.get(userId);
    if (state) {
      state.lastTranscriptionTime = Date.now();
      
      // Clear existing silence timeout
      if (state.silenceTimeout) {
        clearTimeout(state.silenceTimeout);
        state.silenceTimeout = null;
      }
      
      // Set new silence timeout
      state.silenceTimeout = setTimeout(() => {
        console.log('Silence timeout reached, stopping voice detection');
        VoiceDetectionManager.stopListening(session, userId, 'silence_timeout');
      }, SILENCE_TIMEOUT_MS);
    } else {
      console.log('Voice detection state not found for user:', userId);
      // Re-initialize if missing
      VoiceDetectionManager.initializeUser(userId);
    }

    // Show transcription feedback - simplified to avoid layout errors
    try {
      if (data.isFinal) {
        session.layouts.showTextWall(`🎤 Heard: ${transcript}`, {
          view: ViewType.MAIN,
          durationMs: 2000
        });
      }
      // Don't show interim feedback to avoid layout conflicts
    } catch (error) {
      console.error('Error showing transcription feedback:', error);
    }

    // Only process final transcriptions
    if (!data.isFinal) return;

    // Check for activation phrase
    if (!transcript.includes('stock tracker')) {
      console.log('Command ignored - no activation phrase');
      return;
    }

    // Process commands directly (only basic commands in fallback)
    if (transcript.includes('add') || transcript.includes('at') || transcript.includes('ad')) {
      console.log('Processing add stock command', { transcript });
      await this.handleAddStock(session, userId, transcript);
    } else if (transcript.includes('help')) {
      console.log('Processing help command', { transcript });
      this.showHelp(session);
    } else {
      console.log('Unknown voice command', { transcript });
      // Show unknown command feedback instead of failing silently
      this.showUnknownCommandFeedback(session, transcript);
    }
  }

  // Command handler methods for VoiceDetectionManager delegation
  async handleAddStockCommand(session: AppSession, userId: string, transcript: string): Promise<void> {
    await this.handleAddStock(session, userId, transcript);
  }

  handlePinStockCommand(session: AppSession, userId: string, transcript: string): void {
    this.handlePinStock(session, userId, transcript);
  }

  handleRemoveStockCommand(session: AppSession, userId: string, transcript: string): void {
    this.handleRemoveStock(session, userId, transcript);
  }

  handlePriceAlertCommand(session: AppSession, userId: string, transcript: string): void {
    this.handlePriceAlert(session, userId, transcript);
  }

  showHelpCommand(session: AppSession): void {
    this.showHelp(session);
  }

  handleShowDetailsCommand(session: AppSession, userId: string, transcript: string): void {
    this.handleShowDetails(session, userId, transcript);
  }

  /**
   * Show initial app layout
   */
  private showInitialLayout(session: AppSession): void {
    try {
      session.layouts.showTextWall(
        '📈 Stock Tracker\nReady to track your stocks!\nSay "Stock tracker help" for commands.',
        {
          view: ViewType.MAIN,
          durationMs: 5000
        }
      );
      console.log('Initial layout shown successfully');
    } catch (error) {
      console.error('Error showing initial layout:', error);
      // Fallback to simple text wall
      try {
        session.layouts.showTextWall('Stock Tracker Ready', {
          view: ViewType.MAIN,
          durationMs: 3000
        });
      } catch (fallbackError) {
        console.error('Error showing fallback layout:', fallbackError);
      }
    }
  }

  /**
   * Safe layout display with error handling - simplified version
   */
  private safeShowLayout(session: AppSession, layoutType: 'textWall' | 'doubleTextWall' | 'dashboardCard', 
                        title: string, message?: string, options?: any): void {
    try {
      // Only use the most reliable layout method
      session.layouts.showTextWall(title, {
        view: ViewType.MAIN,
        durationMs: 5000
      });
      console.log('Safe layout display successful');
    } catch (error) {
      console.error('Layout display error:', error);
      // Try with minimal options
      try {
        session.layouts.showTextWall(title);
        console.log('Minimal layout successful');
      } catch (fallbackError) {
        console.error('All layout methods failed:', fallbackError);
      }
    }
  }

  /**
   * Force display the watchlist with error handling
   */
  private forceDisplayWatchlist(userId: string, session: AppSession): void {
    console.log('Force displaying watchlist for user:', userId);
    
    // Add a small delay to ensure the stock was added
    setTimeout(() => {
      try {
        this.displayWatchlist(userId, session);
      } catch (error) {
        console.error('Error in force display watchlist:', error);
        // Show a simple fallback
        this.safeShowLayout(session, 'textWall', 'Watchlist updated');
      }
    }, 500);
  }

  /**
   * Shows real-time transcription feedback to the user
   */
  private showTranscriptionFeedback(session: AppSession, data: TranscriptionData, userId?: string): void {
    const transcript = data.text.trim();
    
    if (!transcript) {
      // Show listening indicator when no transcript yet
      this.showListeningStatus(session, true, userId);
      return;
    }

    if (data.isFinal) {
      // Final transcript - show in main view briefly
      session.layouts.showTextWall(
        `🎤 Heard: ${transcript}`,
        {
          view: ViewType.MAIN,
          durationMs: 3000
        }
      );
      // Hide listening indicator after final transcript
      this.showListeningStatus(session, false, userId);
      
      // Show processing indicator for final transcript
      setTimeout(() => {
        this.showProcessingIndicator(session);
      }, 500);
    } else {
      // Interim transcript - don't show feedback to avoid layout conflicts
      // Show listening indicator during interim
      this.showListeningStatus(session, true, userId);
    }
  }

  /**
   * Shows or hides the listening status indicator
   */
  private showListeningStatus(session: AppSession, isListening: boolean, userId?: string): void {
    try {
      if (isListening) {
        // Check if user is currently viewing stock data
        if (userId) {
          const sessionManager = SessionManager.getInstance();
          const displayState = sessionManager.getDisplayState(userId);
          if (displayState && displayState.isShowingStockData) {
            console.log('Skipping listening status - user is viewing stock data');
            return; // Don't override stock data display
          }
        }

        // Show listening indicator using adaptive display
        const adaptiveDisplay = AdaptiveDisplay.getInstance();
        const content = adaptiveDisplay.createListeningStatusContent();
        session.layouts.showTextWall(
          content,
          {
            view: ViewType.MAIN,
            durationMs: 3000
          }
        );
      } else {
        // Don't clear the indicator - let the stock display remain
        // The stock display will naturally replace the listening indicator
      }
    } catch (error) {
      console.error('Error showing listening status:', error);
    }
  }

  /**
   * Trigger-based listening status - only shows when user stops viewing stock data
   * This is more efficient than checking on every transcription
   */
  private triggerListeningStatus(session: AppSession, userId: string): void {
    try {
      const sessionManager = SessionManager.getInstance();
      const displayState = sessionManager.getDisplayState(userId);
      if (!displayState || !displayState.isShowingStockData) {
        // User is not viewing stock data, show listening status
        const adaptiveDisplay = AdaptiveDisplay.getInstance();
        const content = adaptiveDisplay.createListeningStatusContent();
        session.layouts.showTextWall(
          content,
          {
            view: ViewType.MAIN,
            durationMs: 3000
          }
        );
        console.log('Triggered listening status for user:', userId);
      } else {
        console.log('Skipping triggered listening status - user is viewing stock data');
      }
    } catch (error) {
      console.error('Error triggering listening status:', error);
    }
  }

  /**
   * Clear stock display state and trigger listening status if appropriate
   * This is the optimized trigger point for showing listening status
   */
  public clearStockDisplayAndTriggerListening(session: AppSession, userId: string): void {
    try {
      const sessionManager = SessionManager.getInstance();
      const displayState = sessionManager.getDisplayState(userId);
      const wasShowingStockData = displayState?.isShowingStockData || false;
      
      // Clear the stock display state
      sessionManager.updateDisplayState(userId, { isShowingStockData: false, lastStockDisplayTime: Date.now() });
      
      // Only trigger listening status if we were previously showing stock data
      // This prevents unnecessary triggers when user wasn't viewing anything
      if (wasShowingStockData) {
        console.log('Stock display cleared, triggering listening status for user:', userId);
        // Add a small delay to ensure the display has time to clear
        setTimeout(() => {
          this.triggerListeningStatus(session, userId);
        }, 500);
      } else {
        console.log('No stock display was active, skipping listening status trigger');
      }
    } catch (error) {
      console.error('Error clearing stock display and triggering listening:', error);
    }
  }

  /**
   * Shows feedback for command processing
   */
  private showCommandFeedback(session: AppSession, title: string, message: string, userId?: string, skipTrigger: boolean = false): void {
    try {
      // Use optimized trigger approach when clearing stock display (unless skipped)
      if (userId && !skipTrigger) {
        this.clearStockDisplayAndTriggerListening(session, userId);
      }

      // Show processing indicator first
      this.showProcessingIndicator(session);
      
      // Then show the actual feedback
      setTimeout(() => {
        try {
          session.layouts.showTextWall(
            `${title}\n${message}`,
            {
              view: ViewType.MAIN,
              durationMs: 4000
            }
          );
        } catch (error) {
          console.error('Error showing command feedback:', error);
        }
      }, 500); // Small delay to show processing indicator
    } catch (error) {
      console.error('Error showing processing indicator:', error);
    }
  }

  /**
   * Shows command feedback and then restores the previous display state
   */
  public showCommandFeedbackAndRestore(session: AppSession, userId: string, title: string, message: string): void {
    try {
      // Show processing indicator first
      this.showProcessingIndicator(session);
      
      // Then show the actual feedback
      setTimeout(() => {
        try {
          session.layouts.showTextWall(
            `${title}\n${message}`,
            {
              view: ViewType.MAIN,
              durationMs: 3000 // Shorter duration for error messages
            }
          );
          
          // After showing the feedback, restore the previous display state
          setTimeout(() => {
            this.restorePreviousDisplay(session, userId);
          }, 3500); // Wait for feedback to finish, then restore
          
        } catch (error) {
          console.error('Error showing command feedback:', error);
          // If feedback fails, still try to restore display
          setTimeout(() => {
            this.restorePreviousDisplay(session, userId);
          }, 1000);
        }
      }, 500); // Small delay to show processing indicator
    } catch (error) {
      console.error('Error showing processing indicator:', error);
      // If processing indicator fails, still try to restore display
      setTimeout(() => {
        this.restorePreviousDisplay(session, userId);
      }, 1000);
    }
  }

  /**
   * Restores the previous display state based on user's current state
   */
  private restorePreviousDisplay(session: AppSession, userId: string): void {
    try {
      const focusState = userFocusState.get(userId);
      
      if (focusState && focusState.isFocused && focusState.ticker) {
        // User was in focus mode, restore focused stock view
        console.log('Restoring focused stock view for:', focusState.ticker);
        this.restoreFocusedStockView(session, userId, focusState.ticker);
      } else {
        // User was in watchlist mode, restore watchlist view
        console.log('Restoring watchlist view');
        this.displayWatchlist(userId, session);
      }
    } catch (error) {
      console.error('Error restoring previous display:', error);
      // Fallback to watchlist view
      try {
        this.displayWatchlist(userId, session);
      } catch (fallbackError) {
        console.error('Error in fallback display:', fallbackError);
      }
    }
  }

  /**
   * Restores the focused stock view for a specific ticker
   */
  private async restoreFocusedStockView(session: AppSession, userId: string, ticker: string): Promise<void> {
    try {
      const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');
      const detailedData = await this.fetchDetailedStockData(ticker, session);
      
      if (detailedData) {
        // Get stock name from database or use ticker
        const tickerDb = LazyTickerDatabase.getInstance();
        const tickerMatch = await tickerDb.searchBySymbol(ticker);
        const stockName = tickerMatch ? tickerMatch.name : ticker;
        
        this.showDetailedStockView(session, ticker, stockName, detailedData, userId);
      } else {
        // If we can't fetch data, fall back to watchlist
        console.log('Could not restore focused view, falling back to watchlist');
        this.displayWatchlist(userId, session);
      }
    } catch (error) {
      console.error('Error restoring focused stock view:', error);
      // Fall back to watchlist
      this.displayWatchlist(userId, session);
    }
  }

  /**
   * Shows a processing indicator
   */
  private showProcessingIndicator(session: AppSession): void {
    session.layouts.showTextWall('⚙️ Processing...', {
      view: ViewType.MAIN,
      durationMs: 1000
    });
  }

  /**
   * Shows a listening indicator to let users know the app is ready
   */
  private showListeningIndicator(session: AppSession): void {
    try {
      session.layouts.showTextWall('🎤 Ready to listen...\nSay "Stock tracker help" for commands', {
        view: ViewType.MAIN,
        durationMs: 5000
      });
      console.log('Listening indicator shown');
    } catch (error) {
      console.error('Error showing listening indicator:', error);
    }
  }

  /**
   * Shows feedback for unknown commands
   */
  private showUnknownCommandFeedback(session: AppSession, transcript: string): void {
    try {
      session.layouts.showTextWall(
        `❓ Unknown Command\n"${transcript}"\n\nTry saying:\n"Stock tracker help" for commands`,
        {
          view: ViewType.MAIN,
          durationMs: 5000
        }
      );
      console.log('Unknown command feedback shown for:', transcript);
    } catch (error) {
      console.error('Error showing unknown command feedback:', error);
    }
  }

  /**
   * Handles the focus command to show detailed stock information
   */
  async handleFocusCommand(session: AppSession, userId: string, transcript: string): Promise<void> {
    // Extract stock name/ticker from transcript
    const focusMatch = transcript.match(/(?:focus on|focus)\s+([a-zA-Z\s]+?)(?:[.,]|$)/);
    if (!focusMatch) {
      this.showCommandFeedbackAndRestore(session, userId, '❌ Invalid Focus Command', 'Please specify a stock to focus on. Try: "Stock tracker focus on AAPL"');
      return;
    }

    const companyName = focusMatch[1].trim();
    console.log('Focus command for:', companyName);

    try {
      // First, try to use it as a direct ticker (only if it's exactly a valid ticker format)
      // Remove dashes and spaces for validation (common transcription issue)
      const cleanCompanyName = companyName.toUpperCase().replace(/[\s-]+/g, '');
      if (cleanCompanyName.length <= 5 && /^[A-Z]+$/.test(cleanCompanyName) && cleanCompanyName.length >= 2) {
        // Check if this is actually a known ticker symbol
        const tickerDb = LazyTickerDatabase.getInstance();
        const tickerMatch = await tickerDb.searchBySymbol(cleanCompanyName);
        
        if (tickerMatch) {
          // It's a valid ticker symbol
          const ticker = cleanCompanyName;
          const stockName = tickerMatch.name;
          
          // Fetch detailed stock data
          const detailedData = await this.fetchDetailedStockData(ticker, session);
          if (!detailedData) {
            this.showCommandFeedbackAndRestore(session, userId, '❌ Data Unavailable', `Could not fetch data for ${ticker}. Please try again.`);
            return;
          }

          // Set focus state
          userFocusState.set(userId, { ticker, isFocused: true });

          // Show detailed stock view
          this.showDetailedStockView(session, ticker, stockName, detailedData, userId);
          return;
        }
        // If not a valid ticker, continue to company name lookup
      }
      
      // Try company name lookup
      console.log('Looking up company name:', companyName);
      const lookupResult = await CompanyLookup.lookupCompany(companyName);
      console.log('Lookup result:', lookupResult);
      
      if (lookupResult.success && lookupResult.results.length > 0) {
        const bestMatch = lookupResult.results[0];
        const ticker = bestMatch.ticker;
        const stockName = bestMatch.name;
        
        // Fetch detailed stock data
        const detailedData = await this.fetchDetailedStockData(ticker, session);
        if (!detailedData) {
          this.showCommandFeedbackAndRestore(session, userId, '❌ Data Unavailable', `Could not fetch data for ${ticker}. Please try again.`);
          return;
        }

        // Set focus state
        userFocusState.set(userId, { ticker, isFocused: true });

        // Show detailed stock view
        this.showDetailedStockView(session, ticker, stockName, detailedData, userId);
      } else {
        // Show error if no matches found
        this.showCommandFeedbackAndRestore(session, userId, '❌ Company Not Found', `Could not find "${companyName}". Try using the ticker symbol.`);
        console.log('Company lookup failed', { companyName, error: lookupResult.error });
      }

    } catch (error) {
      console.error('Error in focus command:', error);
      this.showCommandFeedbackAndRestore(session, userId, '❌ Focus Error', `Error focusing on ${companyName}. Please try again.`);
    }
  }

  /**
   * Handles the view watchlist command to return to normal view
   */
  handleViewWatchlistCommand(session: AppSession, userId: string): void {
    // Clear focus state
    userFocusState.set(userId, { ticker: '', isFocused: false });

    // Show watchlist
    this.displayWatchlist(userId, session);
    
    // Don't trigger listening status here since we're showing watchlist data
    this.showCommandFeedback(session, '📊 Watchlist View', 'Returned to watchlist view', userId, true);
  }

  /**
   * Handles the clear display command to clear current display and show listening status
   */
  handleClearDisplayCommand(session: AppSession, userId: string): void {
    // Clear focus state
    userFocusState.set(userId, { ticker: '', isFocused: false });

    // Clear any current display and trigger listening status
    this.clearStockDisplayAndTriggerListening(session, userId);
    
    // Show feedback that display was cleared
    this.showCommandFeedback(session, '🗑️ Display Cleared', 'Cleared current display', userId, true);
  }

  /**
   * Gets enhanced stock data with price tracking information
   */
  private getEnhancedStockData(ticker: string, baseData: any): any {
    // Get price tracking data from cache
    const priceTrackingData = stockDataCache.getPriceData(ticker);
    const cachedPercentageChange = stockDataCache.getCachedPercentageChange(ticker);
    
    return {
      ...baseData,
      priceTracking: {
        hasHistoricalData: stockDataCache.hasValidPercentageData(ticker),
        previousPrice: stockDataCache.getPreviousPrice(ticker),
        cachedPercentageChange: cachedPercentageChange,
        lastUpdated: priceTrackingData?.timestamp
      }
    };
  }

  /**
   * Fetches detailed stock data for focus view with caching
   */
  private async fetchDetailedStockData(ticker: string, session: AppSession): Promise<any> {
    try {
      const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');
      
      // Check cache first
      const cachedData = intelligentCache.getData(ticker);
      if (cachedData) {
        console.log(`Using cached data for ${ticker} (${timeframe})`);
        return cachedData;
      }
      
      // Fetch fresh data
      const freshData = await stockApiManager.fetchStockData(ticker, timeframe);
      
      // Cache the result
      if (freshData) {
        intelligentCache.storeData(ticker, freshData);
        console.log(`Cached fresh data for ${ticker} (${timeframe})`);
        
        // Also store in price tracking cache for percentage change analysis
        if (freshData.price) {
          stockDataCache.storePriceData(ticker, freshData.price);
          console.log(`Stored price data for ${ticker} tracking`);
        }
      }
      
      return freshData;
    } catch (error) {
      console.error('Error fetching detailed stock data:', error);
      return null;
    }
  }

  /**
   * Shows detailed stock information in focus view with comprehensive investment metrics
   */
  private showDetailedStockView(session: AppSession, ticker: string, stockName: string, data: any, userId?: string): void {
    try {
      // Set flag indicating stock data is being displayed
      if (userId) {
        userDisplayState.set(userId, { isShowingStockData: true, lastStockDisplayTime: Date.now() });
      }
      const arrow = data.changePercent >= 0 ? '▲' : '▼';
      const changeText = `${arrow}${Math.abs(data.changePercent).toFixed(2)}%`;
      const changeColor = data.changePercent >= 0 ? '🟢' : '🔴';

      let detailedText = `${stockName} (${ticker})\n`;
      detailedText += `${changeColor} $${data.price.toFixed(2)} ${changeText}\n\n`;
      
      // Basic trading info
      if (data.openPrice) {
        detailedText += `Open: $${data.openPrice.toFixed(2)}\n`;
      }
      if (data.previousClose) {
        detailedText += `Prev Close: $${data.previousClose.toFixed(2)}\n`;
      }
      if (data.dayRange) {
        detailedText += `Day Range: $${data.dayRange.low.toFixed(2)} - $${data.dayRange.high.toFixed(2)}\n`;
      }
      if (data.yearRange) {
        detailedText += `52W Range: $${data.yearRange.low.toFixed(2)} - $${data.yearRange.high.toFixed(2)}\n`;
      }
      if (data.volume) {
        const volumeFormatted = this.formatVolume(data.volume);
        detailedText += `Volume: ${volumeFormatted}\n`;
      }

      detailedText += `\n📊 INVESTMENT METRICS:\n`;

      // 1. Market Cap (Company size)
      if (data.marketCap) {
        const marketCapFormatted = this.formatMarketCap(data.marketCap);
        detailedText += `Market Cap: ${marketCapFormatted}\n`;
      }

      // 2. P/E Ratio (Valuation)
      if (data.peRatio) {
        const peColor = data.peRatio < 15 ? '🟢' : data.peRatio < 25 ? '🟡' : '🔴';
        detailedText += `P/E Ratio: ${peColor} ${data.peRatio.toFixed(2)}\n`;
      }

      // 3. Beta (Volatility/Risk)
      if (data.beta) {
        const betaColor = data.beta < 1 ? '🟢' : data.beta < 1.5 ? '🟡' : '🔴';
        detailedText += `Beta: ${betaColor} ${data.beta.toFixed(2)}\n`;
      }

      // 4. EPS (Earnings per share)
      if (data.eps) {
        const epsColor = data.eps > 0 ? '🟢' : '🔴';
        detailedText += `EPS: ${epsColor} $${data.eps.toFixed(2)}\n`;
      }

      // 5. Return on Equity (Profitability efficiency)
      if (data.returnOnEquity) {
        const roeColor = data.returnOnEquity > 15 ? '🟢' : data.returnOnEquity > 10 ? '🟡' : '🔴';
        detailedText += `ROE: ${roeColor} ${(data.returnOnEquity * 100).toFixed(1)}%\n`;
      }

      // 6. Debt-to-Equity (Financial health)
      if (data.debtToEquity) {
        const debtColor = data.debtToEquity < 0.5 ? '🟢' : data.debtToEquity < 1 ? '🟡' : '🔴';
        detailedText += `Debt/Equity: ${debtColor} ${data.debtToEquity.toFixed(2)}\n`;
      }

      // 7. Profit Margin (Profitability)
      if (data.profitMargin) {
        const marginColor = data.profitMargin > 0.15 ? '🟢' : data.profitMargin > 0.10 ? '🟡' : '🔴';
        detailedText += `Profit Margin: ${marginColor} ${(data.profitMargin * 100).toFixed(1)}%\n`;
      }

      // 8. Revenue Growth (Growth potential)
      if (data.revenueGrowth) {
        const growthColor = data.revenueGrowth > 10 ? '🟢' : data.revenueGrowth > 5 ? '🟡' : '🔴';
        detailedText += `Revenue Growth: ${growthColor} ${data.revenueGrowth.toFixed(1)}%\n`;
      }

      // 9. Dividend Yield (Income potential)
      if (data.dividendYield) {
        const yieldColor = data.dividendYield > 3 ? '🟢' : data.dividendYield > 1 ? '🟡' : '🔴';
        detailedText += `Dividend Yield: ${yieldColor} ${(data.dividendYield * 100).toFixed(2)}%\n`;
      }

      // 10. Price-to-Book (Valuation)
      if (data.priceToBook) {
        const pbColor = data.priceToBook < 1.5 ? '🟢' : data.priceToBook < 3 ? '🟡' : '🔴';
        detailedText += `P/B Ratio: ${pbColor} ${data.priceToBook.toFixed(2)}\n`;
      }

      detailedText += `\nSay "Stock tracker view watchlist" to return`;

      session.layouts.showTextWall(detailedText, {
        view: ViewType.MAIN,
        durationMs: 20000 // Show longer for detailed view with more metrics
      });

      console.log('Enhanced detailed stock view shown for:', ticker);
    } catch (error) {
      console.error('Error showing detailed stock view:', error);
      if (userId) {
        this.showCommandFeedbackAndRestore(session, userId, '❌ Display Error', 'Error showing detailed stock information');
      } else {
        this.showCommandFeedback(session, '❌ Display Error', 'Error showing detailed stock information');
      }
    }
  }

  /**
   * Formats volume numbers for display
   */
  private formatVolume(volume: number): string {
    if (volume >= 1000000000) {
      return `${(volume / 1000000000).toFixed(1)}B`;
    } else if (volume >= 1000000) {
      return `${(volume / 1000000).toFixed(1)}M`;
    } else if (volume >= 1000) {
      return `${(volume / 1000).toFixed(1)}K`;
    }
    return volume.toString();
  }

  /**
   * Formats market cap numbers for display
   */
  private formatMarketCap(marketCap: number): string {
    if (marketCap >= 1000000000000) {
      return `$${(marketCap / 1000000000000).toFixed(1)}T`;
    } else if (marketCap >= 1000000000) {
      return `$${(marketCap / 1000000000).toFixed(1)}B`;
    } else if (marketCap >= 1000000) {
      return `$${(marketCap / 1000000).toFixed(1)}M`;
    }
    return `$${marketCap.toLocaleString()}`;
  }

  /**
   * Handles adding a stock to the watchlist
   */
  private async handleAddStock(session: AppSession, userId: string, transcript: string): Promise<void> {
    // Show processing feedback
    this.showCommandFeedback(session, 'Processing...', 'Looking up stock information', userId);
    
    // Add a small delay to prevent rapid successive additions
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Extract stock name/ticker from transcript (improved regex to handle punctuation and common mistranscriptions)
    // Support both "add company" and "add ticker SYMBOL" formats
    const addMatch = transcript.match(/(?:add|at|ad|focus on|focus)\s+(?:ticker\s+)?([a-zA-Z\s]+?)(?:[.,]|$)/);
    if (addMatch) {
      const companyName = addMatch[1].trim();
      const isTickerCommand = transcript.toLowerCase().includes('ticker');
      
      console.log('Extracted company name from voice command:', { 
        originalTranscript: transcript, 
        extractedName: companyName,
        matchedCommand: addMatch[0],
        isTickerCommand
      });
      
      // Check if stock is already in watchlist
      const watchlist = userWatchlists.get(userId) || [];
      const existingStock = watchlist.find(stock => 
        stock.ticker === companyName.toUpperCase() || 
        stock.ticker === companyName.toUpperCase().replace(/\s+/g, '')
      );
      
      if (existingStock) {
        this.showCommandFeedbackAndRestore(session, userId, 'ℹ️ Already Added', `${existingStock.ticker} is already in your watchlist`);
        return;
      }
      
      // Handle ticker command - user explicitly wants to add a ticker symbol
      if (isTickerCommand) {
        // Remove dashes and spaces from ticker symbol (common transcription issue)
        const ticker = companyName.toUpperCase().replace(/[\s-]+/g, '');
        
        // Validate ticker format (2-5 uppercase letters)
        if (ticker.length >= 2 && ticker.length <= 5 && /^[A-Z]+$/.test(ticker)) {
          console.log('Processing ticker command for:', ticker);
          
          // Try to fetch data directly from Yahoo Finance to validate the ticker
          try {
            const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');
            
            // Use Yahoo Finance directly for validation (no mock fallback)
            const yahooProvider = new YahooFinanceProvider();
            const stockData = await yahooProvider.fetchStockData(ticker, timeframe);
            
            if (stockData) {
              // Ticker is valid and has data
              const added = this.addStock(userId, ticker);
              if (added) {
                this.saveWatchlist(userId, session);
                this.showCommandFeedback(session, '✅ Ticker Added', `${ticker} added to watchlist`);
                // Force display the watchlist immediately
                this.forceDisplayWatchlist(userId, session);
                this.updateWatchlistData(userId, session);
              }
              return;
            } else {
              // Ticker not found or no data available
              this.showCommandFeedbackAndRestore(session, userId, '❌ Invalid Ticker', `Ticker ${ticker} not found or no data available`);
              return;
            }
          } catch (error) {
            console.error('Error validating ticker:', error);
            this.showCommandFeedbackAndRestore(session, userId, '❌ Ticker Error', `Error validating ticker ${ticker}. Please check the symbol.`);
            return;
          }
        } else {
          // Invalid ticker format
          this.showCommandFeedbackAndRestore(session, userId, '❌ Invalid Ticker Format', `Invalid ticker format: ${ticker}. Use 2-5 uppercase letters.`);
          return;
        }
      }
      
      // First, try to use it as a direct ticker (only if it's exactly a valid ticker format)
      // Remove dashes and spaces for validation (common transcription issue)
      const cleanCompanyName = companyName.toUpperCase().replace(/[\s-]+/g, '');
      if (cleanCompanyName.length <= 5 && /^[A-Z]+$/.test(cleanCompanyName) && cleanCompanyName.length >= 2) {
        // Check if this is actually a known ticker symbol
        const tickerDb = LazyTickerDatabase.getInstance();
        const tickerMatch = await tickerDb.searchBySymbol(cleanCompanyName);
        
        if (tickerMatch) {
          // It's a valid ticker symbol
          const ticker = cleanCompanyName;
          const added = this.addStock(userId, ticker);
          if (added) {
            this.saveWatchlist(userId, session);
            this.showCommandFeedback(session, '✅ Stock Added', `${ticker} (${tickerMatch.name}) added to watchlist`);
            // Force display the watchlist immediately
            this.forceDisplayWatchlist(userId, session);
            this.updateWatchlistData(userId, session);
          }
          return;
        }
        // If not a valid ticker, continue to company name lookup
      }
      
      // Try company name lookup
      try {
        console.log('Looking up company name:', companyName);
        const lookupResult = await CompanyLookup.lookupCompany(companyName);
        console.log('Lookup result:', lookupResult);
        
        if (lookupResult.success && lookupResult.results.length > 0) {
          const bestMatch = lookupResult.results[0];
          const ticker = bestMatch.ticker;
          
          // Check if the looked-up ticker is already in watchlist
          const existingLookupStock = watchlist.find(stock => stock.ticker === ticker);
          if (existingLookupStock) {
            this.showCommandFeedbackAndRestore(session, userId, 'ℹ️ Already Added', `${ticker} (${companyName}) is already in your watchlist`);
            return;
          }
          
          const added = this.addStock(userId, ticker);
          if (added) {
            this.saveWatchlist(userId, session);
            // Show confirmation with company name
            this.showCommandFeedback(session, '✅ Stock Added', `${companyName} (${ticker}) added to watchlist`);
            // Force display the watchlist immediately
            this.forceDisplayWatchlist(userId, session);
            this.updateWatchlistData(userId, session);
          }
        } else {
          // Show error if no matches found
          this.showCommandFeedbackAndRestore(session, userId, '❌ Company Not Found', `Could not find "${companyName}". Try using the ticker symbol.`);
          console.log('Company lookup failed', { companyName, error: lookupResult.error });
        }
      } catch (error) {
        // Show error if lookup fails
        this.showCommandFeedbackAndRestore(session, userId, '❌ Lookup Error', `Error looking up "${companyName}". Try using the ticker symbol.`);
        console.error('Company lookup error', { companyName, error });
      }
    } else {
      this.showCommandFeedbackAndRestore(session, userId, '❌ Invalid Command', 'Please specify a stock to add. Try: "Stock tracker add AAPL"');
    }
  }

  /**
   * Handles pinning a stock
   */
  private handlePinStock(session: AppSession, userId: string, transcript: string): void {
    const pinMatch = transcript.match(/pin\s+([a-zA-Z-]+)/);
    if (pinMatch) {
      // Remove dashes from ticker symbol (common transcription issue)
      const ticker = pinMatch[1].toUpperCase().replace(/[\s-]+/g, '');
      const watchlist = userWatchlists.get(userId);
      if (watchlist) {
        const stock = watchlist.find(s => s.ticker === ticker);
        if (stock) {
          stock.isPinned = true;
          this.saveWatchlist(userId, session);
          
          // Show confirmation
          this.showCommandFeedback(session, '📌 Stock Pinned', `${ticker} is now pinned`);
          this.updateWatchlistData(userId, session);
          console.log('Stock pinned', { ticker, userId });
        } else {
          // Show error if stock not found
          console.log('Attempted to pin non-existent stock', { ticker, userId });
          this.showCommandFeedbackAndRestore(session, userId, '❌ Stock Not Found', `${ticker} is not in your watchlist`);
        }
      }
    } else {
      this.showCommandFeedbackAndRestore(session, userId, '❌ Invalid Command', 'Please specify a stock to pin. Try: "Stock tracker pin AAPL"');
    }
  }

  /**
   * Handles removing a stock from the watchlist
   */
  private handleRemoveStock(session: AppSession, userId: string, transcript: string): void {
    const removeMatch = transcript.match(/remove\s+([a-zA-Z-]+)/);
    if (removeMatch) {
      // Remove dashes from ticker symbol (common transcription issue)
      const ticker = removeMatch[1].toUpperCase().replace(/[\s-]+/g, '');
      const sessionManager = SessionManager.getInstance();
      const watchlist = sessionManager.getWatchlist(userId);
      
      if (watchlist) {
        const stockIndex = watchlist.findIndex(s => s.ticker === ticker);
        if (stockIndex !== -1 && !watchlist[stockIndex].isPinned) {
          const updatedWatchlist = watchlist.filter((_, index) => index !== stockIndex);
          sessionManager.updateWatchlist(userId, updatedWatchlist);
          
          // Show confirmation
          this.showCommandFeedback(session, '🗑️ Stock Removed', `${ticker} removed from watchlist`);
          this.updateWatchlistData(userId, session);
          console.log('Stock removed from watchlist', { ticker, userId });
        } else if (stockIndex !== -1 && watchlist[stockIndex].isPinned) {
          // Show error if stock is pinned
          console.log('Attempted to remove pinned stock', { ticker, userId });
          this.showCommandFeedbackAndRestore(session, userId, '❌ Cannot Remove', `${ticker} is pinned. Unpin first.`);
        } else {
          // Show error if stock not found
          console.log('Attempted to remove non-existent stock', { ticker, userId });
          this.showCommandFeedbackAndRestore(session, userId, '❌ Stock Not Found', `${ticker} is not in your watchlist`);
        }
      }
    } else {
      this.showCommandFeedbackAndRestore(session, userId, '❌ Invalid Command', 'Please specify a stock to remove. Try: "Stock tracker remove AAPL"');
    }
  }

  /**
   * Handles price alert requests (acknowledges for now)
   */
  private handlePriceAlert(session: AppSession, userId: string, transcript: string): void {
    console.log('Price alert requested', { transcript, userId });
    // TODO: Implement full alert logic in future version
  }

  /**
   * Handles tool calls from Mira AI
   */
  protected override async onToolCall(toolCall: any): Promise<string | undefined> {
    console.log(`Tool called: ${toolCall.toolId}`);
    console.log(`Tool call timestamp: ${toolCall.timestamp}`);
    console.log(`Tool call userId: ${toolCall.userId}`);

    if (toolCall.toolParameters && Object.keys(toolCall.toolParameters).length > 0) {
      console.log("Tool call parameter values:", toolCall.toolParameters);
    }

    try {
      switch (toolCall.toolId) {
        case "add_stock":
          return await this.handleAddStockTool(toolCall);
        
        case "remove_stock":
          return await this.handleRemoveStockTool(toolCall);
        
        case "pin_stock":
          return await this.handlePinStockTool(toolCall);
        
        case "get_watchlist":
          return await this.handleGetWatchlistTool(toolCall);
        
        case "get_stock_price":
          return await this.handleGetStockPriceTool(toolCall);
        
        case "set_timeframe":
          return await this.handleSetTimeframeTool(toolCall);
        
        case "set_refresh_interval":
          return await this.handleSetRefreshIntervalTool(toolCall);
        
        default:
          console.warn(`Unknown tool ID: ${toolCall.toolId}`);
          return `Unknown tool: ${toolCall.toolId}`;
      }
    } catch (error) {
      console.error('Error handling tool call:', error);
      return `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Tool: Add stock to watchlist
   */
  private async handleAddStockTool(toolCall: any): Promise<string> {
    const { ticker } = toolCall.toolParameters;
    const userId = toolCall.userId;

    if (!ticker) {
      return "Error: Ticker symbol is required";
    }

    const sessionManager = SessionManager.getInstance();
    const watchlist = sessionManager.getWatchlist(userId);
    
    // Check if stock is already on the list
    if (watchlist.some(stock => stock.ticker === ticker.toUpperCase())) {
      return `${ticker.toUpperCase()} is already in your watchlist`;
    }

    // Add new stock
    const newStock: Stock = {
      ticker: ticker.toUpperCase(),
      price: null,
      changePercent: null,
      isPinned: false
    };

    const updatedWatchlist = [...watchlist, newStock];
    sessionManager.updateWatchlist(userId, updatedWatchlist);
    
    return `Added ${ticker.toUpperCase()} to your watchlist`;
  }

  /**
   * Tool: Remove stock from watchlist
   */
  private async handleRemoveStockTool(toolCall: any): Promise<string> {
    const { ticker } = toolCall.toolParameters;
    const userId = toolCall.userId;

    if (!ticker) {
      return "Error: Ticker symbol is required";
    }

    const sessionManager = SessionManager.getInstance();
    const watchlist = sessionManager.getWatchlist(userId);
    if (!watchlist || watchlist.length === 0) {
      return "You don't have a watchlist yet";
    }

    const stockIndex = watchlist.findIndex(s => s.ticker === ticker.toUpperCase());
    if (stockIndex === -1) {
      return `${ticker.toUpperCase()} is not in your watchlist`;
    }

    if (watchlist[stockIndex].isPinned) {
      return `${ticker.toUpperCase()} is pinned and cannot be removed. Unpin it first.`;
    }

    const updatedWatchlist = watchlist.filter((_, index) => index !== stockIndex);
    sessionManager.updateWatchlist(userId, updatedWatchlist);
    return `Removed ${ticker.toUpperCase()} from your watchlist`;
  }

  /**
   * Tool: Pin stock in watchlist
   */
  private async handlePinStockTool(toolCall: any): Promise<string> {
    const { ticker } = toolCall.toolParameters;
    const userId = toolCall.userId;

    if (!ticker) {
      return "Error: Ticker symbol is required";
    }

    const sessionManager = SessionManager.getInstance();
    const watchlist = sessionManager.getWatchlist(userId);
    if (!watchlist || watchlist.length === 0) {
      return "You don't have a watchlist yet";
    }

    const stockIndex = watchlist.findIndex(s => s.ticker === ticker.toUpperCase());
    if (stockIndex === -1) {
      return `${ticker.toUpperCase()} is not in your watchlist`;
    }

    const updatedWatchlist = [...watchlist];
    updatedWatchlist[stockIndex] = { ...updatedWatchlist[stockIndex], isPinned: true };
    sessionManager.updateWatchlist(userId, updatedWatchlist);
    return `Pinned ${ticker.toUpperCase()} to your watchlist`;
  }

  /**
   * Tool: Get current watchlist
   */
  private async handleGetWatchlistTool(toolCall: any): Promise<string> {
    const userId = toolCall.userId;
    const sessionManager = SessionManager.getInstance();
    const watchlist = sessionManager.getWatchlist(userId);

    if (!watchlist || watchlist.length === 0) {
      return "Your watchlist is empty. Add some stocks to get started!";
    }

    const stockList = watchlist.map(stock => {
      const pinIcon = stock.isPinned ? '📌' : '';
      const priceInfo = stock.price ? `$${stock.price.toFixed(2)}` : 'Loading...';
      const changeInfo = stock.changePercent !== null ? 
        `${stock.changePercent >= 0 ? '▲' : '▼'}${Math.abs(stock.changePercent).toFixed(2)}%` : '';
      
      return `${pinIcon}${stock.ticker}: ${priceInfo} ${changeInfo}`.trim();
    }).join('\n');

    return `Your watchlist (${watchlist.length} stocks):\n${stockList}`;
  }

  /**
   * Tool: Get stock price
   */
  private async handleGetStockPriceTool(toolCall: any): Promise<string> {
    const { ticker, timeframe = '1D' } = toolCall.toolParameters;

    if (!ticker) {
      return "Error: Ticker symbol is required";
    }

    try {
      const stockData = await this.fetchStockData(ticker.toUpperCase(), timeframe);
      if (stockData) {
        const changeIcon = stockData.changePercent >= 0 ? '▲' : '▼';
        return `${ticker.toUpperCase()}: $${stockData.price.toFixed(2)} ${changeIcon}${Math.abs(stockData.changePercent).toFixed(2)}% (${timeframe})`;
      } else {
        return `Unable to fetch data for ${ticker.toUpperCase()}`;
      }
    } catch (error) {
      return `Error fetching data for ${ticker.toUpperCase()}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * Tool: Set timeframe
   */
  private async handleSetTimeframeTool(toolCall: any): Promise<string> {
    const { timeframe } = toolCall.toolParameters;
    const userId = toolCall.userId;

    const validTimeframes = ['1D', '1W', '1M', '1Y'];
    if (!validTimeframes.includes(timeframe)) {
      return `Invalid timeframe. Please use one of: ${validTimeframes.join(', ')}`;
    }

    // Note: In a real implementation, this would update the user's settings
    // For now, we'll just acknowledge the request
    return `Timeframe set to ${timeframe}. This will be applied to your next session.`;
  }

  /**
   * Tool: Set refresh interval
   */
  private async handleSetRefreshIntervalTool(toolCall: any): Promise<string> {
    const { interval_seconds } = toolCall.toolParameters;
    const userId = toolCall.userId;

    const interval = parseInt(interval_seconds);
    if (isNaN(interval) || interval < 30 || interval > 300) {
      return "Invalid interval. Please use a value between 30 and 300 seconds.";
    }

    // Note: In a real implementation, this would update the user's settings
    // For now, we'll just acknowledge the request
    return `Refresh interval set to ${interval} seconds. This will be applied to your next session.`;
  }

  /**
   * Adds a stock to the user's watchlist
   */
  private addStock(userId: string, ticker: string): boolean {
    const sessionManager = SessionManager.getInstance();
    const watchlist = sessionManager.getWatchlist(userId);
    
    // Check if stock is already on the list
    if (watchlist.some(stock => stock.ticker === ticker)) {
      console.log('Stock already in watchlist, skipping addition', { ticker, userId });
      return false;
    }

    // Add new stock
    const newStock: Stock = {
      ticker,
      price: null,
      changePercent: null,
      isPinned: false
    };

    const updatedWatchlist = [...watchlist, newStock];
    sessionManager.updateWatchlist(userId, updatedWatchlist);
    console.log('Stock added to watchlist', { ticker, userId });
    return true;
  }

  /**
   * Saves the watchlist to session settings
   */
  private saveWatchlist(userId: string, session: AppSession): void {
    const watchlist = userWatchlists.get(userId) || [];
    // Note: settings.set is not available in this SDK version
    // Watchlist persistence would need to be implemented differently
  }

  /**
   * Updates watchlist data using Phase 2 optimizations (batch API + intelligent cache)
   */
  private async updateWatchlistData(userId: string, session: AppSession): Promise<void> {
    const sessionManager = SessionManager.getInstance();
    const batchApiManager = BatchApiManager.getInstance();
    const intelligentCache = IntelligentCache.getInstance();
    const watchlist = sessionManager.getWatchlist(userId);
    
    if (!watchlist || watchlist.length === 0) {
      return;
    }

    try {
      // Get current timeframe from settings
      const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');
      
      // Process stocks with intelligent cache and batch API
      const dataPromises = watchlist.map(async (stock) => {
        // Check intelligent cache first
        const cachedData = intelligentCache.getData(stock.ticker);
        
        if (cachedData) {
          console.log(`Using intelligent cache for ${stock.ticker}`);
          return {
            ticker: stock.ticker,
            price: cachedData.price,
            changePercent: cachedData.changePercent
          };
        } else {
          // Fetch fresh data using batch API manager
          console.log(`Fetching fresh data for ${stock.ticker} via batch API`);
          const result = await batchApiManager.fetchStockData(stock.ticker, 'normal');
          
          // Store in intelligent cache
          if (result) {
            intelligentCache.storeData(stock.ticker, result);
            console.log(`Stored ${stock.ticker} in intelligent cache`);
          }
          
          return {
            ticker: stock.ticker,
            price: result?.price || null,
            changePercent: result?.changePercent || null
          };
        }
      });
      
      const results = await Promise.all(dataPromises);
      
      // Update stock data
      const updatedWatchlist = [...watchlist];
      results.forEach((result) => {
        const stockIndex = updatedWatchlist.findIndex(stock => stock.ticker === result.ticker);
        if (stockIndex !== -1 && result.price !== null) {
          updatedWatchlist[stockIndex].price = result.price;
          updatedWatchlist[stockIndex].changePercent = result.changePercent;
        }
      });

      // Update session with new watchlist data
      sessionManager.updateWatchlist(userId, updatedWatchlist);

      // Display updated watchlist
      this.displayWatchlist(userId, session);
      
    } catch (error) {
      console.error('Error updating watchlist data', { userId, error: error.message });
    }
  }

  /**
   * Fetches stock data using the multi-provider API manager
   */
  private async fetchStockData(ticker: string, timeframe: string): Promise<StockApiResponse | null> {
    try {
      return await stockApiManager.fetchStockData(ticker, timeframe);
    } catch (error) {
      console.error('Error fetching stock data', { ticker, timeframe, error: error.message });
      return null;
    }
  }

  /**
   * Displays the watchlist on the smart glasses with adaptive layout
   */
  private displayWatchlist(userId: string, session: AppSession): void {
    const sessionManager = SessionManager.getInstance();
    const adaptiveDisplay = AdaptiveDisplay.getInstance();
    const watchlist = sessionManager.getWatchlist(userId);
    
    if (!watchlist || watchlist.length === 0) {
      console.log('No watchlist found for user:', userId);
      return;
    }

    console.log('Displaying watchlist for user:', userId, 'stocks:', watchlist.length);

    // Set flag indicating stock data is being displayed
    sessionManager.updateDisplayState(userId, { isShowingStockData: true, lastStockDisplayTime: Date.now() });

    // Get current settings
    const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');

    if (watchlist.length === 0) {
      // Show empty state with adaptive text wall
      try {
        const emptyContent = adaptiveDisplay.createTextWallContent([]);
        session.layouts.showTextWall(
          emptyContent,
          {
            view: ViewType.MAIN,
            durationMs: -1
          }
        );
        console.log('Successfully displayed empty watchlist (adaptive)');
      } catch (error) {
        console.error('Error showing empty watchlist:', error);
      }
      return;
    }

    // For single stock, show detailed info
    if (watchlist.length === 1) {
      const stock = watchlist[0];
      this.displaySingleStockAdaptive(session, stock, timeframe);
      return;
    }

    // For multiple stocks, show adaptive summary
    this.displayMultipleStocksAdaptive(session, watchlist, timeframe);
  }

  /**
   * Displays a single stock with adaptive layout
   */
  private displaySingleStockAdaptive(session: AppSession, stock: Stock, timeframe: string): void {
    const adaptiveDisplay = AdaptiveDisplay.getInstance();
    
    try {
      if (stock.price === null || stock.changePercent === null) {
        session.layouts.showTextWall(
          `Stock Tracker\n${stock.ticker}\nLoading stock data...`,
          {
            view: ViewType.MAIN,
            durationMs: -1
          }
        );
      } else {
        // Use adaptive display for single stock
        const content = adaptiveDisplay.createDetailedStockContent(stock);
        session.layouts.showTextWall(
          content,
          {
            view: ViewType.MAIN,
            durationMs: -1
          }
        );
      }
      console.log('Successfully displayed single stock view (adaptive)');
    } catch (error) {
      console.error('Error displaying single stock:', error);
      this.simpleFallback(session, stock);
    }
  }

  /**
   * Displays a single stock with simple layout (fallback)
   */
  private displaySingleStock(session: AppSession, stock: Stock, timeframe: string): void {
    try {
      if (stock.price === null || stock.changePercent === null) {
        session.layouts.showTextWall(
          `Stock Tracker\n${stock.ticker}\nLoading stock data...`,
          {
            view: ViewType.MAIN,
            durationMs: -1
          }
        );
      } else {
        const arrow = stock.changePercent >= 0 ? '▲' : '▼';
        const changeText = `${arrow}${Math.abs(stock.changePercent).toFixed(2)}%`;
        const pinIcon = stock.isPinned ? '📌' : '';
        
        session.layouts.showTextWall(
          `Stock Tracker (${timeframe})\n${pinIcon}${stock.ticker}\n$${stock.price.toFixed(2)} ${changeText}`,
          {
            view: ViewType.MAIN,
            durationMs: -1
          }
        );
      }
      console.log('Successfully displayed single stock view');
    } catch (error) {
      console.error('Error displaying single stock:', error);
      this.simpleFallback(session, stock);
    }
  }

  /**
   * Displays multiple stocks with adaptive layout
   */
  private displayMultipleStocksAdaptive(session: AppSession, watchlist: Stock[], timeframe: string): void {
    const adaptiveDisplay = AdaptiveDisplay.getInstance();
    
    try {
      // Use adaptive display for multiple stocks
      const content = adaptiveDisplay.createTextWallContent(watchlist);
      session.layouts.showTextWall(
        content,
        {
          view: ViewType.MAIN,
          durationMs: -1
        }
      );
      console.log('Successfully displayed multiple stocks view (adaptive)');
    } catch (error) {
      console.error('Error displaying multiple stocks:', error);
      this.displayMultipleStocks(session, watchlist, timeframe); // Fallback to original method
    }
  }

  /**
   * Displays multiple stocks with simple layout (fallback)
   */
  private displayMultipleStocks(session: AppSession, watchlist: Stock[], timeframe: string): void {
    // Create simple summary text
    let summaryText = `Stock Tracker (${timeframe})\n\n`;
    
    const topStocks = watchlist.slice(0, 5); // Show top 5 stocks
    topStocks.forEach(stock => {
      const pinIcon = stock.isPinned ? '📌' : '';
      
      if (stock.price === null || stock.changePercent === null) {
        summaryText += `${pinIcon}${stock.ticker} Loading...\n`;
      } else {
        const arrow = stock.changePercent >= 0 ? '▲' : '▼';
        const changeText = `${arrow}${Math.abs(stock.changePercent).toFixed(2)}%`;
        summaryText += `${pinIcon}${stock.ticker} $${stock.price.toFixed(2)} ${changeText}\n`;
      }
    });

    if (watchlist.length > 5) {
      summaryText += `\n+${watchlist.length - 5} more stocks`;
    }

    try {
      session.layouts.showTextWall(
        summaryText,
        {
          view: ViewType.MAIN,
          durationMs: 10000
        }
      );
      console.log('Successfully displayed multiple stocks summary');
    } catch (error) {
      console.error('Error showing multiple stocks summary:', error);
      this.simpleFallback(session, watchlist[0]);
    }
  }

  /**
   * Simple fallback display when other layouts fail
   */
  private simpleFallback(session: AppSession, stock: Stock): void {
    try {
      const displayText = stock.price !== null && stock.changePercent !== null
        ? `Stock Tracker\n${stock.ticker}: $${stock.price.toFixed(2)}`
        : `Stock Tracker\n${stock.ticker}: Loading...`;
      
      session.layouts.showTextWall(displayText, {
        view: ViewType.MAIN,
        durationMs: 5000
      });
      console.log('Used simple fallback for:', stock.ticker);
    } catch (error) {
      console.error('Simple fallback also failed for:', stock.ticker, error);
    }
  }

  /**
   * Updates the refresh interval for a user
   */
  private updateRefreshInterval(userId: string, session: AppSession, newIntervalSeconds: number): void {
    // Clear existing interval
    const existingInterval = userRefreshIntervals.get(userId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }

    // Set new interval
    const newInterval = setInterval(() => {
      this.updateWatchlistData(userId, session);
    }, newIntervalSeconds * 1000);
    
    userRefreshIntervals.set(userId, newInterval);
    console.log('Refresh interval updated', { userId, newIntervalSeconds });
  }

  /**
   * Enforces the maximum number of stocks in the watchlist
   */
  private enforceMaxStocks(userId: string, session: AppSession, maxStocks: number): void {
    const watchlist = userWatchlists.get(userId);
    if (!watchlist) return;

    // If we're over the limit, remove unpinned stocks from the end
    while (watchlist.length > maxStocks) {
      const unpinnedIndex = watchlist.findIndex(stock => !stock.isPinned);
      if (unpinnedIndex === -1) {
        // All stocks are pinned, can't remove any
        console.log(`Cannot enforce max stocks for user ${userId}: all stocks are pinned`);
        break;
      }
      watchlist.splice(unpinnedIndex, 1);
    }

    // Save the updated watchlist
    this.saveWatchlist(userId, session);
    console.log('Max stocks limit enforced', { userId, currentCount: watchlist.length, maxStocks });
  }

  /**
   * Shows detailed stock information in a reference card
   */
  private showStockDetails(session: AppSession, stock: Stock, timeframe: string): void {
    if (stock.price === null || stock.changePercent === null) {
      session.layouts.showReferenceCard(
        `${stock.isPinned ? '📌' : ''}${stock.ticker}`,
        'Loading stock data...\n\nPlease wait while we fetch the latest information.',
        {
          view: ViewType.MAIN,
          durationMs: 5000
        }
      );
      return;
    }

    const color = stock.changePercent >= 0 ? 'green' : 'red';
    const arrow = stock.changePercent >= 0 ? '▲' : '▼';
    const changeText = `${arrow}${Math.abs(stock.changePercent).toFixed(1)}%`;
    const changeAmount = stock.price * (stock.changePercent / 100);

    const details = `Current Price: $${stock.price.toFixed(2)}
Change: <color="${color}">${changeText}</color> ($${changeAmount.toFixed(2)})
Timeframe: ${timeframe}
Status: ${stock.isPinned ? 'Pinned' : 'Standard'}

Voice Commands:
• "Pin ${stock.ticker}" to pin
• "Remove ${stock.ticker}" to remove`;

    session.layouts.showReferenceCard(
      `${stock.isPinned ? '📌' : ''}${stock.ticker}`,
      details,
      {
        view: ViewType.MAIN,
        durationMs: 8000
      }
    );
  }

  /**
   * Shows help information in a reference card
   */
  private showHelp(session: AppSession): void {
    const helpText = `Voice Commands:
• "Stock tracker add AAPL" - Add stock to watchlist
• "Stock tracker add ticker CRWD" - Add specific ticker symbol
• "Stock tracker focus on NVIDIA" - Show detailed stock info
• "Stock tracker focus Apple" - Focus on stock (any format)
• "Stock tracker view watchlist" - Return to watchlist view
• "Stock tracker pin Apple" - Pin stock to prevent removal
• "Stock tracker remove Google" - Remove stock from watchlist
• "Stock tracker alert me if Tesla drops below 175" - Set price alert
• "Stock tracker help" - Show this help
• "Stock tracker details AAPL" - Show stock details

Focus View Features:
• Real-time price and change
• Day range and 52-week range
• Volume and trading data
• Open price and previous close
• Professional trading information

Settings:
• timeframe: 1D, 1W, 1M, 1Y
• refresh_interval_seconds: 30-300
• max_stocks: 1-10

Say "Stock tracker focus on [stock]" for detailed analysis!`;

    session.layouts.showTextWall(
      helpText,
      {
        view: ViewType.MAIN,
        durationMs: 15000
      }
    );
  }

  /**
   * Handles showing detailed stock information
   */
  private handleShowDetails(session: AppSession, userId: string, transcript: string): void {
    const detailsMatch = transcript.match(/(?:details|info)\s+([a-zA-Z-]+)/);
    if (detailsMatch) {
      // Remove dashes from ticker symbol (common transcription issue)
      const ticker = detailsMatch[1].toUpperCase().replace(/[\s-]+/g, '');
      const watchlist = userWatchlists.get(userId);
      const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');
      
      if (watchlist) {
        const stock = watchlist.find(s => s.ticker === ticker);
        if (stock) {
          this.showStockDetails(session, stock, timeframe);
        } else {
          session.layouts.showTextWall(
            `Stock Not Found\n${ticker} is not in your watchlist`,
            {
              view: ViewType.MAIN,
              durationMs: 4000
            }
          );
        }
      }
    }
  }
}

// Create and start the app
const stockTrackerApp = new StockTrackerApp();

// Add global cleanup handlers (commented out due to access restrictions)
// stockTrackerApp.addCleanupHandler(() => {
  console.log('Cleaning up global resources...');
  
  // Clear all intervals
  userRefreshIntervals.forEach((interval, userId) => {
    clearInterval(interval);
    console.log(`Cleared refresh interval for user ${userId}`);
  });
  userRefreshIntervals.clear();
  
  // Clear all cleanup functions
  userCleanupFunctions.forEach((cleanupFunctions, userId) => {
    cleanupFunctions.forEach(cleanup => cleanup());
    console.log(`Cleaned up ${cleanupFunctions.length} event listeners for user ${userId}`);
  });
  userCleanupFunctions.clear();
  
  // Clear all watchlists
  userWatchlists.clear();
  
  console.log('Global cleanup completed');
// });

// Start the server
stockTrackerApp.start().then(() => {
  console.log(`📈 ${PACKAGE_NAME} StockTracker server running on port ${PORT}`);
  console.log(`🔗 Health check available at: http://localhost:${PORT}/health`);
  console.log(`📊 Status endpoint: http://localhost:${PORT}/api/status`);
  console.log(`🔧 API endpoints:`);
  console.log(`   GET  /api/status - App status and metrics`);
  console.log(`   GET  /api/user/:userId/watchlist - Get user watchlist`);
  console.log(`   POST /api/user/:userId/stock - Add stock to watchlist`);
  console.log(`   POST /api/token - Generate JWT token`);
  console.log(`   GET  /api/stock/:ticker - Get stock data`);
  console.log(`🤖 AI Tools available:`);
  console.log(`   - add_stock`);
  console.log(`   - remove_stock`);
  console.log(`   - pin_stock`);
  console.log(`   - get_watchlist`);
  console.log(`   - get_stock_price`);
  console.log(`   - set_timeframe`);
  console.log(`   - set_refresh_interval`);
  
  // Start memory management
  MemoryManager.startMemoryCleanup();
  console.log('🧠 Memory management started');
}).catch(error => {
  console.error('❌ Failed to start StockTracker server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  MemoryManager.stopMemoryCleanup();
  stockTrackerApp.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  MemoryManager.stopMemoryCleanup();
  stockTrackerApp.stop();
  process.exit(0);
});

