/**
 * Adaptive Display System for Smart Glasses
 * 
 * Provides different display modes optimized for smart glasses:
 * - Minimal: Essential info only (ticker, price, change)
 * - Standard: Basic info (adds volume, market cap)
 * - Detailed: Full metrics (all investment data)
 */

import { Stock } from '../types';

export interface DisplayInfo {
  primary: string;
  secondary?: string;
  tertiary?: string;
  details?: string[];
  color?: 'green' | 'red' | 'gray' | 'yellow' | 'blue';
}

export interface DeviceCapabilities {
  screenSize: 'small' | 'medium' | 'large';
  hasColor: boolean;
  hasHighContrast: boolean;
  maxLines: number;
  maxCharsPerLine: number;
}

export type DisplayMode = 'minimal' | 'standard' | 'detailed';

export class AdaptiveDisplay {
  private static instance: AdaptiveDisplay;
  private deviceCapabilities: DeviceCapabilities;
  private userPreferences: {
    displayMode: DisplayMode;
    showColors: boolean;
    showDetails: boolean;
  };

  private constructor() {
    // Default to smart glasses capabilities
    this.deviceCapabilities = {
      screenSize: 'small',
      hasColor: true,
      hasHighContrast: true,
      maxLines: 4,
      maxCharsPerLine: 20
    };

    this.userPreferences = {
      displayMode: 'minimal',
      showColors: true,
      showDetails: false
    };
  }

  /**
   * Get singleton instance
   */
  static getInstance(): AdaptiveDisplay {
    if (!AdaptiveDisplay.instance) {
      AdaptiveDisplay.instance = new AdaptiveDisplay();
    }
    return AdaptiveDisplay.instance;
  }

  /**
   * Set device capabilities
   */
  setDeviceCapabilities(capabilities: Partial<DeviceCapabilities>): void {
    this.deviceCapabilities = { ...this.deviceCapabilities, ...capabilities };
    console.log('Device capabilities updated:', this.deviceCapabilities);
  }

  /**
   * Set user preferences
   */
  setUserPreferences(preferences: Partial<typeof this.userPreferences>): void {
    this.userPreferences = { ...this.userPreferences, ...preferences };
    console.log('User preferences updated:', this.userPreferences);
  }

  /**
   * Get optimal display mode based on device and preferences
   */
  getOptimalDisplayMode(): DisplayMode {
    // Smart glasses default to minimal mode
    if (this.deviceCapabilities.screenSize === 'small') {
      return this.userPreferences.displayMode === 'detailed' ? 'standard' : 'minimal';
    }
    
    return this.userPreferences.displayMode;
  }

  /**
   * Display stock information adaptively
   */
  displayStockInfo(stock: Stock): DisplayInfo {
    const mode = this.getOptimalDisplayMode();
    
    switch (mode) {
      case 'minimal':
        return this.getMinimalDisplay(stock);
      case 'standard':
        return this.getStandardDisplay(stock);
      case 'detailed':
        return this.getDetailedDisplay(stock);
      default:
        return this.getMinimalDisplay(stock);
    }
  }

  /**
   * Minimal display - essential info only
   */
  private getMinimalDisplay(stock: Stock): DisplayInfo {
    const changeSymbol = stock.changePercent && stock.changePercent > 0 ? '▲' : '▼';
    const changeColor = this.getChangeColor(stock.changePercent);
    
    return {
      primary: `${stock.ticker} $${this.formatPrice(stock.price)}`,
      secondary: `${changeSymbol} ${this.formatChange(stock.changePercent)}`,
      color: changeColor
    };
  }

  /**
   * Standard display - basic info
   */
  private getStandardDisplay(stock: Stock): DisplayInfo {
    const minimal = this.getMinimalDisplay(stock);
    
    return {
      ...minimal,
      tertiary: `Vol: ${this.formatVolume(stock.volume)}`,
      details: stock.marketCap ? [`MC: ${this.formatMarketCap(stock.marketCap)}`] : undefined
    };
  }

  /**
   * Detailed display - full metrics
   */
  private getDetailedDisplay(stock: Stock): DisplayInfo {
    const standard = this.getStandardDisplay(stock);
    const details: string[] = [];
    
    // Add key investment metrics
    if (stock.peRatio) details.push(`P/E: ${stock.peRatio.toFixed(1)}`);
    if (stock.beta) details.push(`Beta: ${stock.beta.toFixed(2)}`);
    if (stock.dividendYield) details.push(`Div: ${stock.dividendYield.toFixed(2)}%`);
    if (stock.eps) details.push(`EPS: $${stock.eps.toFixed(2)}`);
    
    return {
      ...standard,
      details: [...(standard.details || []), ...details]
    };
  }

  /**
   * Display watchlist adaptively
   */
  displayWatchlist(stocks: Stock[]): DisplayInfo[] {
    const mode = this.getOptimalDisplayMode();
    const maxStocks = this.getMaxStocksForMode(mode);
    
    return stocks.slice(0, maxStocks).map(stock => this.displayStockInfo(stock));
  }

  /**
   * Get maximum number of stocks to display based on mode
   */
  private getMaxStocksForMode(mode: DisplayMode): number {
    switch (mode) {
      case 'minimal':
        return 5; // Can show more stocks in minimal mode
      case 'standard':
        return 3; // Fewer stocks in standard mode
      case 'detailed':
        return 1; // Only one stock in detailed mode
      default:
        return 3;
    }
  }

  /**
   * Format price for display
   */
  private formatPrice(price: number | null): string {
    if (price === null) return 'N/A';
    return price.toFixed(2);
  }

  /**
   * Format percentage change
   */
  private formatChange(change: number | null): string {
    if (change === null) return '0.00%';
    const sign = change >= 0 ? '+' : '';
    return `${sign}${change.toFixed(2)}%`;
  }

  /**
   * Format volume for display
   */
  private formatVolume(volume: number | undefined): string {
    if (!volume) return 'N/A';
    
    if (volume >= 1e9) {
      return `${(volume / 1e9).toFixed(1)}B`;
    } else if (volume >= 1e6) {
      return `${(volume / 1e6).toFixed(1)}M`;
    } else if (volume >= 1e3) {
      return `${(volume / 1e3).toFixed(1)}K`;
    } else {
      return volume.toString();
    }
  }

  /**
   * Format market cap for display
   */
  private formatMarketCap(marketCap: number | undefined): string {
    if (!marketCap) return 'N/A';
    
    if (marketCap >= 1e12) {
      return `$${(marketCap / 1e12).toFixed(1)}T`;
    } else if (marketCap >= 1e9) {
      return `$${(marketCap / 1e9).toFixed(1)}B`;
    } else if (marketCap >= 1e6) {
      return `$${(marketCap / 1e6).toFixed(1)}M`;
    } else {
      return `$${marketCap.toFixed(0)}`;
    }
  }

  /**
   * Get color for change percentage
   */
  private getChangeColor(change: number | null): 'green' | 'red' | 'gray' {
    if (change === null) return 'gray';
    return change > 0 ? 'green' : change < 0 ? 'red' : 'gray';
  }

  /**
   * Create text wall content for smart glasses
   */
  createTextWallContent(stocks: Stock[]): string {
    const mode = this.getOptimalDisplayMode();
    const displayInfos = this.displayWatchlist(stocks);
    
    if (displayInfos.length === 0) {
      return 'No stocks in watchlist\nSay "Stock tracker add AAPL"';
    }

    let content = 'Stock Tracker\n';
    
    displayInfos.forEach((info, index) => {
      content += `${info.primary}\n`;
      if (info.secondary) {
        content += `${info.secondary}\n`;
      }
      if (info.tertiary) {
        content += `${info.tertiary}\n`;
      }
      if (info.details && info.details.length > 0) {
        content += `${info.details.join(' | ')}\n`;
      }
      if (index < displayInfos.length - 1) {
        content += '\n';
      }
    });

    return content.trim();
  }

  /**
   * Create detailed stock view content
   */
  createDetailedStockContent(stock: Stock): string {
    const info = this.getDetailedDisplay(stock);
    let content = `${info.primary}\n`;
    
    if (info.secondary) {
      content += `${info.secondary}\n`;
    }
    
    if (info.tertiary) {
      content += `${info.tertiary}\n`;
    }
    
    if (info.details && info.details.length > 0) {
      content += `\n${info.details.join('\n')}`;
    }
    
    return content.trim();
  }

  /**
   * Get display statistics
   */
  getDisplayStats(): {
    deviceCapabilities: DeviceCapabilities;
    userPreferences: {
      displayMode: DisplayMode;
      showColors: boolean;
      showDetails: boolean;
    };
    optimalMode: DisplayMode;
    maxStocks: number;
  } {
    return {
      deviceCapabilities: { ...this.deviceCapabilities },
      userPreferences: { ...this.userPreferences },
      optimalMode: this.getOptimalDisplayMode(),
      maxStocks: this.getMaxStocksForMode(this.getOptimalDisplayMode())
    };
  }

  /**
   * Create listening status content
   */
  createListeningStatusContent(): string {
    return '🎤 Ready to listen...\nSay "Stock tracker help" for commands';
  }

  /**
   * Check if display should be updated
   */
  shouldUpdateDisplay(lastUpdate: number, mode: DisplayMode): boolean {
    const now = Date.now();
    const updateIntervals = {
      minimal: 5000,    // 5 seconds for minimal
      standard: 3000,   // 3 seconds for standard
      detailed: 2000    // 2 seconds for detailed
    };
    
    return (now - lastUpdate) > (updateIntervals[mode] || 5000);
  }
}
