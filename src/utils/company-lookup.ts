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

  // Common company name mappings for better search results
  private static readonly COMMON_COMPANY_NAMES: Map<string, string> = new Map([
    ['google', 'alphabet'],
    ['alphabet', 'alphabet'],
    ['apple', 'apple'],
    ['microsoft', 'microsoft'],
    ['amazon', 'amazon'],
    ['tesla', 'tesla'],
    ['meta', 'meta'],
    ['facebook', 'meta'],
    ['netflix', 'netflix'],
    ['nvidia', 'nvidia'],
    ['amd', 'amd'],
    ['intel', 'intel'],
    ['ibm', 'ibm'],
    ['oracle', 'oracle'],
    ['salesforce', 'salesforce'],
    ['adobe', 'adobe'],
    ['paypal', 'paypal'],
    ['visa', 'visa'],
    ['mastercard', 'mastercard'],
    ['disney', 'disney'],
    ['coca cola', 'coca-cola'],
    ['coke', 'coca-cola'],
    ['mcdonalds', 'mcdonalds'],
    ['starbucks', 'starbucks'],
    ['walmart', 'walmart'],
    ['target', 'target'],
    ['home depot', 'home depot'],
    ['lowes', 'lowes'],
    ['costco', 'costco'],
    ['boeing', 'boeing'],
    ['general electric', 'general electric'],
    ['ge', 'general electric'],
    ['ford', 'ford'],
    ['general motors', 'general motors'],
    ['gm', 'general motors'],
    ['chevron', 'chevron'],
    ['exxon', 'exxon'],
    ['shell', 'shell'],
    ['bp', 'bp'],
    ['jpmorgan', 'jpmorgan'],
    ['jpm', 'jpmorgan'],
    ['bank of america', 'bank of america'],
    ['boa', 'bank of america'],
    ['wells fargo', 'wells fargo'],
    ['goldman sachs', 'goldman sachs'],
    ['morgan stanley', 'morgan stanley'],
    ['blackrock', 'blackrock'],
    ['berkshire hathaway', 'berkshire hathaway'],
    ['berkshire', 'berkshire hathaway'],
    ['brk', 'berkshire hathaway']
  ]);

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

      // Strategy 2: Check common company name mappings
      const mappedName = this.COMMON_COMPANY_NAMES.get(normalizedName);
      if (mappedName) {
        console.log(`Using mapped company name: "${normalizedName}" -> "${mappedName}"`);
        const mappedMatches = await tickerDb.searchByName(mappedName, 5);
        if (mappedMatches.length > 0) {
          const results: CompanyInfo[] = mappedMatches.map((ticker, index) => ({
            ticker: ticker.symbol,
            name: ticker.name,
            confidence: Math.max(0.95 - (index * 0.1), 0.6) // High confidence for mapped names
          }));

          return {
            success: true,
            results
          };
        }
      }

      // Strategy 3: Search by original company name
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

      // Strategy 4: Return empty result
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


}
