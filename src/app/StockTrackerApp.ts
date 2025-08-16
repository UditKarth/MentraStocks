import path from 'path';
import {
  AppServer,
  AppSession,
  ViewType,
  TranscriptionData,
  StreamType,
} from '@mentra/sdk';
import axios from 'axios';
import express from 'express';

// Configuration constants
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 80;
const PACKAGE_NAME = process.env.PACKAGE_NAME;
const AUGMENTOS_API_KEY = process.env.AUGMENTOS_API_KEY;
const FINANCIAL_API_KEY = process.env.FINANCIAL_API_KEY;

// Verify env vars are set.
if (!AUGMENTOS_API_KEY) {
  throw new Error('AUGMENTOS_API_KEY environment variable is required.');
}
if (!PACKAGE_NAME) {
  throw new Error('PACKAGE_NAME environment variable is required.');
}
if (!FINANCIAL_API_KEY) {
  throw new Error('FINANCIAL_API_KEY environment variable is required.');
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
   * Sets up custom Express routes for the StockTracker app
   */
  private setupCustomRoutes(): void {
    const app = this.getExpressApp();

    // Add custom middleware for logging
    app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });

    // Custom endpoint to get app status
    app.get('/api/status', (req, res) => {
      const status = {
        app: 'StockTracker',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        activeSessions: userWatchlists.size,
        totalStocks: Array.from(userWatchlists.values()).reduce((total, watchlist) => total + watchlist.length, 0),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
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
          timestamp: new Date().toISOString()
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
   * Called by AppServer when a new session is created
   */
  protected async onSession(session: AppSession, sessionId: string, userId: string): Promise<void> {
    // Use the built-in session logger instead of console.log
    session.logger.info('StockTracker session started', { 
      sessionId, 
      userId,
      capabilities: session.capabilities ? Object.keys(session.capabilities) : null
    });

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

      session.logger.info('Session initialized', { 
        watchlistCount: watchlist.length, 
        timeframe, 
        refreshInterval, 
        maxStocks 
      });

      // Check device capabilities and adapt behavior
      if (session.capabilities) {
        session.logger.debug('Device capabilities detected', { 
          hasMicrophone: !!session.capabilities.microphone,
          hasDisplay: !!session.capabilities.display,
          hasButtons: !!session.capabilities.buttons
        });
      }

      // Start data refresh loop
      const interval = setInterval(() => {
        this.updateWatchlistData(userId, session);
      }, refreshInterval * 1000);
      userRefreshIntervals.set(userId, interval);

      // Initial display
      await this.updateWatchlistData(userId, session);

      // Set up voice command listener using proper event subscription
      const transcriptionCleanup = session.events.onTranscription((data) => {
        session.logger.debug('Received transcription', { 
          text: data.text, 
          isFinal: data.isFinal,
          language: data.language 
        });
        this.handleVoiceCommand(session, userId, data);
      });
      cleanupFunctions.push(transcriptionCleanup);

      // Subscribe to transcription events
      session.events.subscribe('transcription');

      // Set up settings listeners with proper cleanup
      const timeframeCleanup = session.settings.onValueChange<'1D' | '1W' | '1M' | '1Y'>('timeframe', (newValue, oldValue) => {
        session.logger.info('Timeframe setting changed', { oldValue, newValue });
        
        // Show timeframe change notification
        session.layouts.showDoubleTextWall(
          'Timeframe Updated',
          `Changed to ${newValue} view`,
          {
            view: ViewType.MAIN,
            durationMs: 3000
          }
        );
        
        this.updateWatchlistData(userId, session);
      });
      cleanupFunctions.push(timeframeCleanup);

      const refreshIntervalCleanup = session.settings.onValueChange<number>('refresh_interval_seconds', (newValue, oldValue) => {
        session.logger.info('Refresh interval setting changed', { oldValue, newValue });
        
        // Show refresh interval change notification
        session.layouts.showDoubleTextWall(
          'Refresh Updated',
          `Now refreshing every ${newValue} seconds`,
          {
            view: ViewType.MAIN,
            durationMs: 3000
          }
        );
        
        this.updateRefreshInterval(userId, session, newValue);
      });
      cleanupFunctions.push(refreshIntervalCleanup);

      const maxStocksCleanup = session.settings.onValueChange<number>('max_stocks', (newValue, oldValue) => {
        session.logger.info('Max stocks setting changed', { oldValue, newValue });
        
        // Show max stocks change notification
        session.layouts.showDoubleTextWall(
          'Limit Updated',
          `Max stocks: ${newValue}`,
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
        session.logger.debug('Settings changed', { 
          changedKeys: Object.keys(changes),
          changes 
        });
      });
      cleanupFunctions.push(allSettingsCleanup);

      // Listen for MentraOS settings if needed
      const metricSystemCleanup = session.settings.onMentraosSettingChange<boolean>('metricSystemEnabled', (enabled, wasEnabled) => {
        session.logger.info('Metric system setting changed', { enabled, wasEnabled });
        // Could be used for currency formatting in the future
      });
      cleanupFunctions.push(metricSystemCleanup);

      // Set up head position detection for dashboard visibility
      if (session.capabilities?.headPosition) {
        const headPositionCleanup = session.events.onHeadPosition((data) => {
          session.logger.debug('Head position changed', { position: data.position });
          // Could be used to show/hide dashboard based on head position
        });
        cleanupFunctions.push(headPositionCleanup);
        session.events.subscribe('headPosition');
      }

      // Set up button press handling if available
      if (session.capabilities?.buttons) {
        const buttonPressCleanup = session.events.onButtonPress((data) => {
          session.logger.debug('Button pressed', { button: data.button });
          // Could be used for quick actions like refresh or help
          if (data.button === 'primary') {
            this.showHelp(session);
          }
        });
        cleanupFunctions.push(buttonPressCleanup);
        session.events.subscribe('buttonPress');
      }

      // Set up subscription settings for automatic management
      session.settings.setSubscriptionSettings({
        updateOnChange: ['timeframe', 'refresh_interval_seconds'],
        handler: (settings) => {
          // Return required stream types based on current settings
          const streams: StreamType[] = ['transcription'];
          
          if (session.capabilities?.headPosition) {
            streams.push('headPosition');
          }
          if (session.capabilities?.buttons) {
            streams.push('buttonPress');
          }
          
          return streams;
        }
      });

    } catch (error) {
      session.logger.error(error, 'Error initializing StockTracker session');
      throw error; // Re-throw to let the framework handle it
    }
  }

  /**
   * Called by AppServer when a session is stopped
   */
  protected async onStop(sessionId: string, userId: string, reason: string): Promise<void> {
    // Note: We don't have access to session.logger here, so we'll use console.log
    // In a real implementation, you might want to store the logger reference
    console.log(`StockTracker session ${sessionId} stopped: ${reason}`);
    
    // Stop the data refresh loop
    const refreshInterval = userRefreshIntervals.get(userId);
    if (refreshInterval) {
      clearInterval(refreshInterval);
      userRefreshIntervals.delete(userId);
      console.log(`Cleared refresh interval for user ${userId}`);
    }

    // Clean up all settings listeners
    const cleanupFunctions = userCleanupFunctions.get(userId);
    if (cleanupFunctions) {
      cleanupFunctions.forEach(cleanup => cleanup());
      userCleanupFunctions.delete(userId);
      console.log(`Cleaned up ${cleanupFunctions.length} event listeners for user ${userId}`);
    }

    // Clean up user data from global maps
    userWatchlists.delete(userId);
    console.log(`Cleaned up user data for ${userId}`);
  }

  /**
   * Handles voice commands from the user
   */
  private handleVoiceCommand(session: AppSession, userId: string, data: TranscriptionData): void {
    const transcript = data.text.toLowerCase();
    session.logger.debug('Processing voice command', { 
      transcript, 
      isFinal: data.isFinal,
      language: data.language 
    });

    // Check for activation phrase
    if (!transcript.includes('stock tracker')) {
      session.logger.debug('Command ignored - no activation phrase');
      return;
    }

    // Parse commands
    if (transcript.includes('add') || transcript.includes('focus on')) {
      session.logger.info('Processing add stock command', { transcript });
      this.handleAddStock(session, userId, transcript);
    } else if (transcript.includes('pin')) {
      session.logger.info('Processing pin stock command', { transcript });
      this.handlePinStock(session, userId, transcript);
    } else if (transcript.includes('remove')) {
      session.logger.info('Processing remove stock command', { transcript });
      this.handleRemoveStock(session, userId, transcript);
    } else if (transcript.includes('alert me') || transcript.includes('tell me when')) {
      session.logger.info('Processing price alert command', { transcript });
      this.handlePriceAlert(session, userId, transcript);
    } else if (transcript.includes('help') || transcript.includes('commands')) {
      session.logger.info('Processing help command', { transcript });
      this.showHelp(session);
    } else if (transcript.includes('details') || transcript.includes('info')) {
      session.logger.info('Processing details command', { transcript });
      this.handleShowDetails(session, userId, transcript);
    } else {
      session.logger.warn('Unknown voice command', { transcript });
    }
  }

  /**
   * Handles adding a stock to the watchlist
   */
  private handleAddStock(session: AppSession, userId: string, transcript: string): void {
    // Extract stock name/ticker from transcript
    const addMatch = transcript.match(/(?:add|focus on)\s+([a-zA-Z]+)/);
    if (addMatch) {
      const ticker = addMatch[1].toUpperCase();
      this.addStock(userId, ticker);
      this.saveWatchlist(userId, session);
      
      // Show confirmation in main view
      session.layouts.showDoubleTextWall(
        'Stock Added',
        `${ticker} added to watchlist`,
        {
          view: ViewType.MAIN,
          durationMs: 3000
        }
      );
      
      this.updateWatchlistData(userId, session);
      session.logger.info('Stock added to watchlist', { ticker, userId });
    }
  }

  /**
   * Handles pinning a stock
   */
  private handlePinStock(session: AppSession, userId: string, transcript: string): void {
    const pinMatch = transcript.match(/pin\s+([a-zA-Z]+)/);
    if (pinMatch) {
      const ticker = pinMatch[1].toUpperCase();
      const watchlist = userWatchlists.get(userId);
      if (watchlist) {
        const stock = watchlist.find(s => s.ticker === ticker);
        if (stock) {
          stock.isPinned = true;
          this.saveWatchlist(userId, session);
          
          // Show confirmation
          session.layouts.showDoubleTextWall(
            'Stock Pinned',
            `${ticker} is now pinned`,
            {
              view: ViewType.MAIN,
              durationMs: 3000
            }
          );
          
          this.updateWatchlistData(userId, session);
          session.logger.info('Stock pinned', { ticker, userId });
        } else {
          // Show error if stock not found
          session.logger.warn('Attempted to pin non-existent stock', { ticker, userId });
          session.layouts.showDoubleTextWall(
            'Stock Not Found',
            `${ticker} is not in your watchlist`,
            {
              view: ViewType.MAIN,
              durationMs: 4000
            }
          );
        }
      }
    }
  }

  /**
   * Handles removing a stock from the watchlist
   */
  private handleRemoveStock(session: AppSession, userId: string, transcript: string): void {
    const removeMatch = transcript.match(/remove\s+([a-zA-Z]+)/);
    if (removeMatch) {
      const ticker = removeMatch[1].toUpperCase();
      const watchlist = userWatchlists.get(userId);
      if (watchlist) {
        const stockIndex = watchlist.findIndex(s => s.ticker === ticker);
        if (stockIndex !== -1 && !watchlist[stockIndex].isPinned) {
          watchlist.splice(stockIndex, 1);
          this.saveWatchlist(userId, session);
          
          // Show confirmation
          session.layouts.showDoubleTextWall(
            'Stock Removed',
            `${ticker} removed from watchlist`,
            {
              view: ViewType.MAIN,
              durationMs: 3000
            }
          );
          
          this.updateWatchlistData(userId, session);
          session.logger.info('Stock removed from watchlist', { ticker, userId });
        } else if (stockIndex !== -1 && watchlist[stockIndex].isPinned) {
          // Show error if stock is pinned
          session.logger.warn('Attempted to remove pinned stock', { ticker, userId });
          session.layouts.showDoubleTextWall(
            'Cannot Remove',
            `${ticker} is pinned. Unpin first.`,
            {
              view: ViewType.MAIN,
              durationMs: 4000
            }
          );
        } else {
          // Show error if stock not found
          session.logger.warn('Attempted to remove non-existent stock', { ticker, userId });
          session.layouts.showDoubleTextWall(
            'Stock Not Found',
            `${ticker} is not in your watchlist`,
            {
              view: ViewType.MAIN,
              durationMs: 4000
            }
          );
        }
      }
    }
  }

  /**
   * Handles price alert requests (acknowledges for now)
   */
  private handlePriceAlert(session: AppSession, userId: string, transcript: string): void {
    session.logger.info('Price alert requested', { transcript, userId });
    // TODO: Implement full alert logic in future version
  }

  /**
   * Handles tool calls from Mira AI
   */
  protected async onToolCall(toolCall: any): Promise<string | undefined> {
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

    const watchlist = userWatchlists.get(userId) || [];
    
    // Check if stock is already on the list
    if (watchlist.some(stock => stock.ticker === ticker.toUpperCase())) {
      return `${ticker.toUpperCase()} is already in your watchlist`;
    }

    // Add new stock
    watchlist.push({
      ticker: ticker.toUpperCase(),
      price: null,
      changePercent: null,
      isPinned: false
    });

    userWatchlists.set(userId, watchlist);
    
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

    const watchlist = userWatchlists.get(userId);
    if (!watchlist) {
      return "You don't have a watchlist yet";
    }

    const stockIndex = watchlist.findIndex(s => s.ticker === ticker.toUpperCase());
    if (stockIndex === -1) {
      return `${ticker.toUpperCase()} is not in your watchlist`;
    }

    if (watchlist[stockIndex].isPinned) {
      return `${ticker.toUpperCase()} is pinned and cannot be removed. Unpin it first.`;
    }

    watchlist.splice(stockIndex, 1);
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

    const watchlist = userWatchlists.get(userId);
    if (!watchlist) {
      return "You don't have a watchlist yet";
    }

    const stock = watchlist.find(s => s.ticker === ticker.toUpperCase());
    if (!stock) {
      return `${ticker.toUpperCase()} is not in your watchlist`;
    }

    stock.isPinned = true;
    return `Pinned ${ticker.toUpperCase()} to your watchlist`;
  }

  /**
   * Tool: Get current watchlist
   */
  private async handleGetWatchlistTool(toolCall: any): Promise<string> {
    const userId = toolCall.userId;
    const watchlist = userWatchlists.get(userId);

    if (!watchlist || watchlist.length === 0) {
      return "Your watchlist is empty. Add some stocks to get started!";
    }

    const stockList = watchlist.map(stock => {
      const pinIcon = stock.isPinned ? '📌' : '';
      const priceInfo = stock.price ? `$${stock.price.toFixed(2)}` : 'Loading...';
      const changeInfo = stock.changePercent !== null ? 
        `${stock.changePercent >= 0 ? '▲' : '▼'}${Math.abs(stock.changePercent).toFixed(1)}%` : '';
      
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
        return `${ticker.toUpperCase()}: $${stockData.price.toFixed(2)} ${changeIcon}${Math.abs(stockData.changePercent).toFixed(1)}% (${timeframe})`;
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
  private addStock(userId: string, ticker: string): void {
    const watchlist = userWatchlists.get(userId) || [];
    
    // Check if stock is already on the list
    if (watchlist.some(stock => stock.ticker === ticker)) {
      return;
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
    session.settings.set('watchlist', watchlist);
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
      
      // Fetch data for all stocks in parallel
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
      session.logger.error(error, 'Error updating watchlist data', { userId });
    }
  }

  /**
   * Fetches stock data from the financial API
   */
  private async fetchStockData(ticker: string, timeframe: string): Promise<StockApiResponse | null> {
    try {
      // Using a mock API endpoint - replace with actual financial API
      const response = await axios.get(`https://api.financialdata.com/v1/quote`, {
        params: {
          symbol: ticker,
          apikey: FINANCIAL_API_KEY,
          timeframe: timeframe
        },
        timeout: 5000
      });

      return {
        price: response.data.price,
        changePercent: response.data.changePercent
      };
    } catch (error) {
      session.logger.error(error, 'Error fetching stock data', { ticker, timeframe });
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
        const changeText = `${arrow}${Math.abs(stock.changePercent).toFixed(1)}%`;
        
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
          const changeText = `${arrow}${Math.abs(stock.changePercent).toFixed(1)}%`;
          
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
    session.logger.info('Refresh interval updated', { userId, newIntervalSeconds });
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
    session.logger.info('Max stocks limit enforced', { userId, currentCount: watchlist.length, maxStocks });
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
• "Stock tracker add AAPL" - Add stock
• "Stock tracker focus on NVIDIA" - Add stock
• "Stock tracker pin Apple" - Pin stock
• "Stock tracker remove Google" - Remove stock
• "Stock tracker alert me if Tesla drops below 175" - Price alert
• "Stock tracker help" - Show this help
• "Stock tracker details AAPL" - Show stock details

Settings:
• timeframe: 1D, 1W, 1M, 1Y
• refresh_interval_seconds: 30-300
• max_stocks: 1-10

The dashboard shows persistent stock cards for quick reference.`;

    session.layouts.showReferenceCard(
      'Stock Tracker Help',
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
    const detailsMatch = transcript.match(/(?:details|info)\s+([a-zA-Z]+)/);
    if (detailsMatch) {
      const ticker = detailsMatch[1].toUpperCase();
      const watchlist = userWatchlists.get(userId);
      const timeframe = session.settings.get<'1D' | '1W' | '1M' | '1Y'>('timeframe', '1D');
      
      if (watchlist) {
        const stock = watchlist.find(s => s.ticker === ticker);
        if (stock) {
          this.showStockDetails(session, stock, timeframe);
        } else {
          session.layouts.showDoubleTextWall(
            'Stock Not Found',
            `${ticker} is not in your watchlist`,
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

// Add global cleanup handlers
stockTrackerApp.addCleanupHandler(() => {
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
});

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
}).catch(error => {
  console.error('❌ Failed to start StockTracker server:', error);
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  stockTrackerApp.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  stockTrackerApp.stop();
  process.exit(0);
});
