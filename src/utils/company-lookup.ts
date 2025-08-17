/**
 * Company name to ticker symbol lookup utilities using local ticker database
 */

import { TickerDatabase, TickerSymbol } from './ticker-database';

export interface CompanyInfo {
  ticker: string;
  name: string;
  exchange?: string;
  confidence: number;
}

export interface CompanyLookupResult {
  success: boolean;
  results: CompanyInfo[];
  error?: string;
}

/**
 * Company name to ticker lookup using local ticker database
 */
export class CompanyLookup {
  private static tickerDb: TickerDatabase;

  /**
   * Initialize the ticker database
   */
  private static getTickerDb(): TickerDatabase {
    if (!this.tickerDb) {
      this.tickerDb = TickerDatabase.getInstance();
    }
    return this.tickerDb;
  }

  /**
   * Look up company by name and return possible ticker matches
   */
  static async lookupCompany(companyName: string): Promise<CompanyLookupResult> {
    const normalizedName = companyName.toLowerCase().trim();
    
    if (!normalizedName) {
      return {
        success: false,
        results: [],
        error: 'Company name cannot be empty'
      };
    }
    
    try {
      const tickerDb = this.getTickerDb();
      
      // Strategy 1: Try exact symbol match first
      const symbolMatch = await tickerDb.searchBySymbol(normalizedName.toUpperCase());
      if (symbolMatch) {
        return {
          success: true,
          results: [{
            ticker: symbolMatch.symbol,
            name: symbolMatch.name,
            confidence: 1.0
          }]
        };
      }

      // Strategy 2: Search by company name
      const nameMatches = await tickerDb.searchByName(normalizedName, 5);
      if (nameMatches.length > 0) {
        const results: CompanyInfo[] = nameMatches.map((ticker, index) => ({
          ticker: ticker.symbol,
          name: ticker.name,
          confidence: Math.max(0.9 - (index * 0.1), 0.5) // Higher confidence for first results
        }));

        return {
          success: true,
          results
        };
      }

      // Strategy 3: Return empty result
      return {
        success: false,
        results: [],
        error: `No matches found for "${companyName}". Try using the stock ticker symbol (e.g., "AAPL" for Apple).`
      };

    } catch (error) {
      return {
        success: false,
        results: [],
        error: `Error looking up company: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Get database statistics
   */
  static async getDatabaseStats(): Promise<{ totalTickers: number }> {
    const tickerDb = this.getTickerDb();
    return {
      totalTickers: await tickerDb.getTotalCount()
    };
  }

  /**
   * Add a custom ticker to the database
   */
  static async addTicker(symbol: string, name: string): Promise<void> {
    const tickerDb = this.getTickerDb();
    await tickerDb.addTicker(symbol, name);
  }

  /**
   * Search by ticker symbol directly
   */
  static async searchBySymbol(symbol: string): Promise<CompanyInfo | null> {
    const tickerDb = this.getTickerDb();
    const result = await tickerDb.searchBySymbol(symbol);
    
    if (result) {
      return {
        ticker: result.symbol,
        name: result.name,
        confidence: 1.0
      };
    }
    
    return null;
  }

  /**
   * Unload the database to free memory
   */
  static unloadDatabase(): void {
    const tickerDb = this.getTickerDb();
    tickerDb.unload();
  }
}
