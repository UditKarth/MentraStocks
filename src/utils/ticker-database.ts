/**
 * Comprehensive ticker symbol database for local company lookup
 * This replaces the need for external API calls for most company searches
 */

export interface TickerSymbol {
  symbol: string;
  name: string;
}

// Import the comprehensive ticker database from the JavaScript file
// @ts-ignore - Importing from JavaScript file
import { TickerSymbols as ImportedTickerSymbols } from './tickersymbols.js';

// Use the imported database
export const TickerSymbols: TickerSymbol[] = ImportedTickerSymbols;

/**
 * Ticker Database Manager for efficient company lookups
 */
export class TickerDatabase {
  private static instance: TickerDatabase;
  private symbolMap: Map<string, TickerSymbol>;
  private nameMap: Map<string, TickerSymbol[]>;

  private constructor() {
    this.symbolMap = new Map();
    this.nameMap = new Map();
    this.buildIndexes();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): TickerDatabase {
    if (!TickerDatabase.instance) {
      TickerDatabase.instance = new TickerDatabase();
    }
    return TickerDatabase.instance;
  }

  /**
   * Build search indexes for fast lookups
   */
  private buildIndexes(): void {
    // Build symbol index
    TickerSymbols.forEach(ticker => {
      this.symbolMap.set(ticker.symbol.toUpperCase(), ticker);
    });

    // Build name index with multiple variations
    TickerSymbols.forEach(ticker => {
      const name = ticker.name.toLowerCase();
      const words = name.split(/\s+/);
      
      // Add full name
      this.addToNameMap(name, ticker);
      
      // Add company name without common suffixes
      const cleanName = name.replace(/\s+(inc\.?|corp\.?|corporation|company|co\.?|ltd\.?|limited|plc|ag|sa|se|nv|llc)$/i, '');
      if (cleanName !== name) {
        this.addToNameMap(cleanName, ticker);
      }
      
      // Add first word (often the main company name)
      if (words.length > 0) {
        this.addToNameMap(words[0], ticker);
      }
      
      // Add common abbreviations
      if (name.includes('international')) {
        this.addToNameMap(name.replace('international', 'intl'), ticker);
      }
      if (name.includes('technologies')) {
        this.addToNameMap(name.replace('technologies', 'tech'), ticker);
      }
    });
  }

  /**
   * Add ticker to name map with multiple variations
   */
  private addToNameMap(name: string, ticker: TickerSymbol): void {
    if (!this.nameMap.has(name)) {
      this.nameMap.set(name, []);
    }
    this.nameMap.get(name)!.push(ticker);
  }

  /**
   * Search by ticker symbol (exact match)
   */
  searchBySymbol(symbol: string): TickerSymbol | undefined {
    return this.symbolMap.get(symbol.toUpperCase());
  }

  /**
   * Search by company name (fuzzy match)
   */
  searchByName(name: string, limit: number = 5): TickerSymbol[] {
    const query = name.toLowerCase().trim();
    const results: Array<{ ticker: TickerSymbol; score: number }> = [];

    // Exact matches first
    const exactMatches = this.nameMap.get(query) || [];
    exactMatches.forEach(ticker => {
      results.push({ ticker, score: 1.0 });
    });

    // Partial matches
    for (const [indexName, tickers] of this.nameMap.entries()) {
      if (indexName.includes(query) || query.includes(indexName)) {
        const similarity = this.calculateSimilarity(query, indexName);
        if (similarity > 0.3) { // Minimum similarity threshold
          tickers.forEach(ticker => {
            if (!results.some(r => r.ticker.symbol === ticker.symbol)) {
              results.push({ ticker, score: similarity });
            }
          });
        }
      }
    }

    // Sort by score and return top results
    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(r => r.ticker);
  }

  /**
   * Calculate similarity between two strings
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Calculate Levenshtein distance
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1, // deletion
          matrix[j - 1][i] + 1, // insertion
          matrix[j - 1][i - 1] + indicator // substitution
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Get total number of tickers in database
   */
  getTotalCount(): number {
    return TickerSymbols.length;
  }

  /**
   * Add a custom ticker to the database
   */
  addTicker(symbol: string, name: string): void {
    const ticker: TickerSymbol = { symbol: symbol.toUpperCase(), name };
    TickerSymbols.push(ticker);
    this.symbolMap.set(symbol.toUpperCase(), ticker);
    this.addToNameMap(name.toLowerCase(), ticker);
  }
}
