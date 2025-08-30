import 'dotenv/config';
import path from 'path';
import {
  AppServer,
  AppSession,
  ViewType,
  TranscriptionData,
} from '@mentra/sdk';
import { mockFetchStockData } from './test-mock-data';

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

/**
 * StockTrackerApp - Main application class that extends AppServer
 * This version uses mock data for testing and demonstration
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
  }

  /**
   * Sets up custom Express routes for the StockTracker app (mock version)
   */
  private setupCustomRoutes(): void {
    const app = this.getExpressApp();

    // Add custom middleware for logging
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path} (MOCK)`);
      next();
    });

    // Custom endpoint to get app status
    app.get('/api/status', (req, res) => {
      const status = {
        app: 'StockTracker (Mock)',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        activeSessions: userWatchlists.size,
        totalStocks: Array.from(userWatchlists.values()).reduce((total, watchlist) => total + watchlist.length, 0),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        mode: 'mock'
      };
      res.json(status);
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
          timestamp: new Date().toISOString(),
          mode: 'mock'
        });
      } else {
        res.status(404).json({ error: 'User not found', userId });
      }
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
        message: 'Stock added successfully (Mock)',
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

      // Use mock data
      setTimeout(async () => {
        try {
          const mockData = await mockFetchStockData(ticker.toUpperCase());
          if (mockData) {
            res.json({
              ticker: ticker.toUpperCase(),
              price: mockData.price,
              changePercent: mockData.changePercent,
              timeframe,
              timestamp: new Date().toISOString(),
              mode: 'mock'
            });
          } else {
            res.status(404).json({ error: 'Stock not found', ticker });
          }
        } catch (error) {
          res.status(500).json({ error: 'Failed to fetch stock data' });
        }
      }, 100 + Math.random() * 200);
    });

    // Error handling middleware
    app.use((err: any, req: any, res: any, next: any) => {
      console.error('Express error (Mock):', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  /**
   * Called by AppServer when a new session is created
   */
  protected override async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    console.log(`\n\n📈📈📈Received new StockTracker session for user ${userId}, session ${sessionId}\n\n`);

    try {
      // Initialize cleanup functions array for this user
      const cleanupFunctions: Array<() => void> = [];
      userCleanupFunctions.set(userId, cleanupFunctions);

      // Load data from settings with proper defaults
      const watchlist = session.settings.get<Stock[]>('watchlist', []);
      const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');
      const refreshInterval = session.settings.get<number>('refresh_interval_seconds', 60);
      const maxStocks = session.settings.get<number>('max_stocks', 5);

      // Initialize state
      userWatchlists.set(userId, watchlist);

      console.log(`Loaded watchlist for user ${userId}: ${watchlist.length} stocks`);
      console.log(`Loaded settings for user ${userId}: timeframe=${timeframe}, refresh=${refreshInterval}s, maxStocks=${maxStocks}`);

      // Start data refresh loop
      const interval = setInterval(() => {
        this.updateWatchlistData(userId, session);
      }, refreshInterval * 1000);
      userRefreshIntervals.set(userId, interval);

      // Initial display
      await this.updateWatchlistData(userId, session);

      // Set up voice command listener
      const transcriptionCleanup = session.onTranscriptionForLanguage('en-US', (data: TranscriptionData) => {
        this.handleVoiceCommand(session, userId, data);
      });
      cleanupFunctions.push(transcriptionCleanup);

      // Set up settings listeners with proper cleanup
      const timeframeCleanup = session.settings.onValueChange<'1D' | '1W' | '1M' | '1Y'>('timeframe', (newValue, oldValue) => {
        console.log(`Timeframe changed for user ${userId}: ${oldValue} -> ${newValue}`);
        this.updateWatchlistData(userId, session);
      });
      cleanupFunctions.push(timeframeCleanup);

      const refreshIntervalCleanup = session.settings.onValueChange<number>('refresh_interval_seconds', (newValue, oldValue) => {
        console.log(`Refresh interval changed for user ${userId}: ${oldValue}s -> ${newValue}s`);
        this.updateRefreshInterval(userId, session, newValue);
      });
      cleanupFunctions.push(refreshIntervalCleanup);

      const maxStocksCleanup = session.settings.onValueChange<number>('max_stocks', (newValue, oldValue) => {
        console.log(`Max stocks changed for user ${userId}: ${oldValue} -> ${newValue}`);
        this.enforceMaxStocks(userId, session, newValue);
      });
      cleanupFunctions.push(maxStocksCleanup);

      // Listen for any settings changes (optional, for debugging)
      const allSettingsCleanup = session.settings.onChange((changes) => {
        console.log(`Settings changed for user ${userId}:`, Object.keys(changes));
      });
      cleanupFunctions.push(allSettingsCleanup);

      // Listen for MentraOS settings if needed
      const metricSystemCleanup = session.settings.onMentraosSettingChange<boolean>('metricSystemEnabled', (enabled, wasEnabled) => {
        console.log(`Metric system ${enabled ? 'enabled' : 'disabled'} for user ${userId}`);
        // Could be used for currency formatting in the future
      });
      cleanupFunctions.push(metricSystemCleanup);

    } catch (error) {
      console.error('Error initializing StockTracker session:', error);
    }
  }

  /**
   * Called by AppServer when a session is stopped
   */
  protected override async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    console.log(`StockTracker session ${sessionId} stopped: ${reason}`);
    
    // Stop the data refresh loop
    const refreshInterval = userRefreshIntervals.get(userId);
    if (refreshInterval) {
      clearInterval(refreshInterval);
      userRefreshIntervals.delete(userId);
    }

    // Clean up all settings listeners
    const cleanupFunctions = userCleanupFunctions.get(userId);
    if (cleanupFunctions) {
      cleanupFunctions.forEach(cleanup => cleanup());
      userCleanupFunctions.delete(userId);
    }

    // Clean up user data from global maps
    userWatchlists.delete(userId);
  }

  /**
   * Handles voice commands from the user
   */
  private handleVoiceCommand(session: AppSession, userId: string, data: TranscriptionData): void {
    const transcript = data.text.toLowerCase();
    console.log(`Voice command received: "${transcript}"`);

    // Check for activation phrase
    if (!transcript.includes('stock tracker')) {
      return;
    }

    // Parse commands
    if (transcript.includes('add') || transcript.includes('focus on') || transcript.includes('at') || transcript.includes('ad')) {
      this.handleAddStock(session, userId, transcript);
    } else if (transcript.includes('pin')) {
      this.handlePinStock(session, userId, transcript);
    } else if (transcript.includes('remove')) {
      this.handleRemoveStock(session, userId, transcript);
    } else if (transcript.includes('alert me') || transcript.includes('tell me when')) {
      this.handlePriceAlert(session, userId, transcript);
    }
  }

  /**
   * Handles adding a stock to the watchlist
   */
  private handleAddStock(session: AppSession, userId: string, transcript: string): void {
    // Extract stock name/ticker from transcript (support both company names and ticker command)
    const addMatch = transcript.match(/(?:add|at|ad|focus on|focus)\s+(?:ticker\s+)?([a-zA-Z\s]+?)(?:[.,]|$)/);
    if (addMatch) {
      const companyName = addMatch[1].trim();
      const isTickerCommand = transcript.toLowerCase().includes('ticker');
      
      console.log('Mock: Extracted from voice command:', { 
        originalTranscript: transcript, 
        extractedName: companyName,
        isTickerCommand
      });
      
      // For ticker command, use the extracted name directly as ticker
      // Remove dashes and spaces from ticker symbol (common transcription issue)
      const ticker = isTickerCommand ? companyName.toUpperCase().replace(/[\s-]+/g, '') : companyName.toUpperCase();
      
      this.addStock(userId, ticker);
      this.saveWatchlist(userId, session);
      this.updateWatchlistData(userId, session);
      console.log(`Added stock ${ticker} to watchlist for user ${userId}`);
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
          this.updateWatchlistData(userId, session);
          console.log(`Pinned stock ${ticker} for user ${userId}`);
        }
      }
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
      const watchlist = userWatchlists.get(userId);
      if (watchlist) {
        const stockIndex = watchlist.findIndex(s => s.ticker === ticker);
        if (stockIndex !== -1 && !watchlist[stockIndex].isPinned) {
          watchlist.splice(stockIndex, 1);
          this.saveWatchlist(userId, session);
          this.updateWatchlistData(userId, session);
          console.log(`Removed stock ${ticker} from watchlist for user ${userId}`);
        }
      }
    }
  }

  /**
   * Handles price alert requests (acknowledges for now)
   */
  private handlePriceAlert(session: AppSession, userId: string, transcript: string): void {
    console.log(`Price alert requested: "${transcript}" - Acknowledged for user ${userId}`);
    // TODO: Implement full alert logic in future version
  }

  /**
   * Adds a stock to the user's watchlist
   */
  private addStock(userId: string, ticker: string): void {
    const watchlist = userWatchlists.get(userId) || [];
    
    // Check if stock is already on the list
    if (watchlist.some(stock => stock.ticker === ticker)) {
      return;
    }

    // If list has 5 or more stocks, remove the first unpinned stock
    if (watchlist.length >= 5) {
      const unpinnedIndex = watchlist.findIndex(stock => !stock.isPinned);
      if (unpinnedIndex !== -1) {
        watchlist.splice(unpinnedIndex, 1);
      }
    }

    // Add new stock
    watchlist.push({
      ticker,
      price: null,
      changePercent: null,
      isPinned: false
    });

    userWatchlists.set(userId, watchlist);
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
   * Updates watchlist data by fetching current prices
   */
  private async updateWatchlistData(userId: string, session: AppSession): Promise<void> {
    const watchlist = userWatchlists.get(userId);
    
    if (!watchlist) {
      return;
    }

    try {
      // Get current timeframe from settings
      const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');
      
      // Fetch data for all stocks in parallel using mock data
      const dataPromises = watchlist.map(stock => 
        this.fetchStockData(stock.ticker, timeframe)
      );
      
      const results = await Promise.all(dataPromises);
      
      // Update stock data
      results.forEach((result, index) => {
        if (result && watchlist[index]) {
          watchlist[index].price = result.price;
          watchlist[index].changePercent = result.changePercent;
        }
      });

      // Display updated watchlist
      this.displayWatchlist(userId, session);
      
    } catch (error) {
      console.error(`Error updating watchlist data for user ${userId}:`, error);
    }
  }

  /**
   * Fetches stock data using mock data (for testing)
   */
  private async fetchStockData(ticker: string, timeframe: string): Promise<StockApiResponse | null> {
    try {
      return await mockFetchStockData(ticker);
    } catch (error) {
      console.error(`Error fetching data for ${ticker}:`, error);
      return null;
    }
  }

  /**
   * Displays the watchlist on the smart glasses with improved layout
   */
  private displayWatchlist(userId: string, session: AppSession): void {
    const watchlist = userWatchlists.get(userId);
    
    if (!watchlist) {
      return;
    }

    // Get current settings
    const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');
    const refreshInterval = session.settings.get<number>('refresh_interval_seconds', 60);

    // Create progress indicator for refresh cycle
    const now = Date.now();
    const progress = Math.floor((now % (refreshInterval * 1000)) / (refreshInterval * 1000) * 10);
    const progressBar = '█'.repeat(progress) + '░'.repeat(10 - progress);

    if (watchlist.length === 0) {
      // Show empty state with instructions
      session.layouts.showDoubleTextWall(
        'Stock Tracker',
        'No stocks in watchlist.\nSay "Stock tracker add AAPL" to add stocks.',
        {
          view: ViewType.MAIN,
          durationMs: 8000
        }
      );
      return;
    }

    // Show main watchlist summary in main view
    const topStocks = watchlist.slice(0, 3); // Show top 3 stocks
    let summaryText = '';
    
    topStocks.forEach(stock => {
      const pinIcon = stock.isPinned ? '📌' : '';
      
      if (stock.price === null || stock.changePercent === null) {
        summaryText += `${pinIcon}${stock.ticker} <color="gray">Loading...</color>\n`;
      } else {
        const color = stock.changePercent >= 0 ? 'green' : 'red';
        const arrow = stock.changePercent >= 0 ? '▲' : '▼';
        const changeText = `${arrow}${Math.abs(stock.changePercent).toFixed(2)}%`;
        
        summaryText += `${pinIcon}${stock.ticker} $${stock.price.toFixed(2)} <color="${color}">${changeText}</color>\n`;
      }
    });

    if (watchlist.length > 3) {
      summaryText += `\n+${watchlist.length - 3} more stocks`;
    }

    session.layouts.showDoubleTextWall(
      `Stock Tracker [${progressBar}] (${timeframe})`,
      summaryText,
      {
        view: ViewType.MAIN,
        durationMs: 12000 // Show longer for main view
      }
    );

    // Show individual stock cards in dashboard for persistent reference
    this.displayDashboardCards(session, watchlist, timeframe);
  }

  /**
   * Displays individual stock cards in the dashboard view
   */
  private displayDashboardCards(session: AppSession, watchlist: Stock[], timeframe: string): void {
    // Clear previous dashboard cards by showing empty state briefly
    session.layouts.showDashboardCard('', '', { view: ViewType.DASHBOARD, durationMs: 100 });

    // Show each stock as a dashboard card
    watchlist.forEach((stock, index) => {
      setTimeout(() => {
        if (stock.price === null || stock.changePercent === null) {
          session.layouts.showDashboardCard(
            `${stock.isPinned ? '📌' : ''}${stock.ticker}`,
            'Loading...',
            { view: ViewType.DASHBOARD }
          );
        } else {
          const color = stock.changePercent >= 0 ? 'green' : 'red';
          const arrow = stock.changePercent >= 0 ? '▲' : '▼';
          const changeText = `${arrow}${Math.abs(stock.changePercent).toFixed(2)}%`;
          
          session.layouts.showDashboardCard(
            `${stock.isPinned ? '📌' : ''}${stock.ticker}`,
            `$${stock.price.toFixed(2)} <color="${color}">${changeText}</color>`,
            { view: ViewType.DASHBOARD }
          );
        }
      }, index * 200); // Stagger the display for better UX
    });
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
    console.log(`Updated refresh interval for user ${userId} to ${newIntervalSeconds} seconds`);
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
    console.log(`Enforced max stocks limit for user ${userId}: ${watchlist.length}/${maxStocks}`);
  }
}

// Create and start the app
const stockTrackerApp = new StockTrackerApp();

// Add global cleanup handlers (commented out due to access restrictions)
// stockTrackerApp.addCleanupHandler(() => {
  console.log('Cleaning up global resources (Mock)...');
  
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
  
  console.log('Global cleanup completed (Mock)');
// });

// Start the server
stockTrackerApp.start().then(() => {
  console.log(`📈 ${PACKAGE_NAME} StockTracker (Mock) server running on port ${PORT}`);
  console.log(`🔗 Health check available at: http://localhost:${PORT}/health`);
  console.log(`📊 Status endpoint: http://localhost:${PORT}/api/status`);
  console.log(`🔧 API endpoints (Mock):`);
  console.log(`   GET  /api/status - App status and metrics`);
  console.log(`   GET  /api/user/:userId/watchlist - Get user watchlist`);
  console.log(`   POST /api/user/:userId/stock - Add stock to watchlist`);
  console.log(`   POST /api/token - Generate JWT token`);
  console.log(`   GET  /api/stock/:ticker - Get mock stock data`);
  console.log(`🤖 AI Tools available (Mock):`);
  console.log(`   - add_stock`);
  console.log(`   - remove_stock`);
  console.log(`   - pin_stock`);
  console.log(`   - get_watchlist`);
  console.log(`   - get_stock_price`);
  console.log(`   - set_timeframe`);
  console.log(`   - set_refresh_interval`);
  console.log(`📝 This version uses mock data for testing and demonstration.`);
}).catch(error => {
  console.error('❌ Failed to start StockTracker (Mock) server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully (Mock)...');
  stockTrackerApp.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully (Mock)...');
  stockTrackerApp.stop();
  process.exit(0);
});
