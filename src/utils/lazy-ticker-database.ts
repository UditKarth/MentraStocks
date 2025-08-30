/**
 * Lazy Loading Ticker Database - Optimized for Memory Usage
 * 
 * This replaces the current approach of loading the entire 521KB database
 * with a chunked, on-demand loading system that reduces memory footprint.
 */

export interface TickerSymbol {
  symbol: string;
  name: string;
}

// Import the comprehensive ticker database from the JavaScript file
// @ts-ignore - Importing from JavaScript file
import { TickerSymbols as ImportedTickerSymbols } from './tickersymbols.js';

export class LazyTickerDatabase {
  private static instance: LazyTickerDatabase;
  private symbolIndex: Map<string, number> = new Map();
  private loadedChunks: Map<number, TickerSymbol[]> = new Map();
  private nameIndex: Map<string, string[]> = new Map(); // name -> symbols[]
  private readonly CHUNK_SIZE = 500; // Smaller chunks for better memory management
  private readonly MAX_LOADED_CHUNKS = 10; // Limit memory usage
  private isInitialized = false;

  private constructor() {
    // Don't initialize immediately - wait for first use
  }

  /**
   * Get singleton instance
   */
  static getInstance(): LazyTickerDatabase {
    if (!LazyTickerDatabase.instance) {
      LazyTickerDatabase.instance = new LazyTickerDatabase();
    }
    return LazyTickerDatabase.instance;
  }

  /**
   * Initialize indexes only when first needed
   */
  private async initializeIndexes(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('Initializing lazy ticker database indexes...');
      
      // Build symbol index with chunk mapping
      ImportedTickerSymbols.forEach((ticker: any, index: number) => {
        const chunkIndex = Math.floor(index / this.CHUNK_SIZE);
        this.symbolIndex.set(ticker.symbol.toUpperCase(), chunkIndex);
        
        // Build name index for company name searches
        const name = ticker.name.toLowerCase();
        if (!this.nameIndex.has(name)) {
          this.nameIndex.set(name, []);
        }
        this.nameIndex.get(name)!.push(ticker.symbol);
      });

      this.isInitialized = true;
      console.log(`Lazy ticker database initialized with ${this.symbolIndex.size} symbols in ${Math.ceil(ImportedTickerSymbols.length / this.CHUNK_SIZE)} chunks`);
    } catch (error) {
      console.error('Failed to initialize lazy ticker database:', error);
      this.isInitialized = true; // Continue with empty maps
    }
  }

  /**
   * Search by ticker symbol (exact match)
   */
  async searchBySymbol(symbol: string): Promise<TickerSymbol | null> {
    await this.initializeIndexes();
    
    const upperSymbol = symbol.toUpperCase();
    const chunkIndex = this.symbolIndex.get(upperSymbol);
    
    if (chunkIndex !== undefined) {
      const chunk = await this.loadChunk(chunkIndex);
      return chunk.find(t => t.symbol.toUpperCase() === upperSymbol) || null;
    }
    
    return null;
  }

  /**
   * Search by company name (fuzzy match)
   */
  async searchByName(name: string, limit: number = 5): Promise<TickerSymbol[]> {
    await this.initializeIndexes();
    
    const normalizedName = name.toLowerCase().trim();
    const results: TickerSymbol[] = [];
    
    // First, try exact name match
    const exactMatches = this.nameIndex.get(normalizedName);
    if (exactMatches) {
      for (const symbol of exactMatches.slice(0, limit)) {
        const ticker = await this.searchBySymbol(symbol);
        if (ticker) results.push(ticker);
      }
    }
    
    // Then try partial matches
    if (results.length < limit) {
      for (const [dbName, symbols] of this.nameIndex.entries()) {
        if (dbName.includes(normalizedName) || normalizedName.includes(dbName)) {
          for (const symbol of symbols) {
            if (results.length >= limit) break;
            const ticker = await this.searchBySymbol(symbol);
            if (ticker && !results.find(r => r.symbol === ticker.symbol)) {
              results.push(ticker);
            }
          }
        }
      }
    }
    
    return results.slice(0, limit);
  }

  /**
   * Load a specific chunk of ticker data
   */
  private async loadChunk(chunkIndex: number): Promise<TickerSymbol[]> {
    // Check if chunk is already loaded
    if (this.loadedChunks.has(chunkIndex)) {
      return this.loadedChunks.get(chunkIndex)!;
    }
    
    // Load the chunk from the imported data
    const startIndex = chunkIndex * this.CHUNK_SIZE;
    const endIndex = Math.min(startIndex + this.CHUNK_SIZE, ImportedTickerSymbols.length);
    const chunk = ImportedTickerSymbols.slice(startIndex, endIndex);
    
    // Store in memory (with size limit)
    this.loadedChunks.set(chunkIndex, chunk);
    
    // Cleanup old chunks if we exceed the limit
    if (this.loadedChunks.size > this.MAX_LOADED_CHUNKS) {
      this.cleanupOldChunks();
    }
    
    console.log(`Loaded chunk ${chunkIndex} with ${chunk.length} tickers`);
    return chunk;
  }

  /**
   * Clean up old chunks to manage memory usage
   */
  private cleanupOldChunks(): void {
    const chunks = Array.from(this.loadedChunks.keys()).sort();
    const chunksToRemove = chunks.slice(0, chunks.length - this.MAX_LOADED_CHUNKS);
    
    chunksToRemove.forEach(chunkIndex => {
      this.loadedChunks.delete(chunkIndex);
    });
    
    console.log(`Cleaned up ${chunksToRemove.length} old chunks`);
  }

  /**
   * Get memory usage statistics
   */
  getMemoryStats(): {
    totalSymbols: number;
    loadedChunks: number;
    maxChunks: number;
    symbolIndexSize: number;
    nameIndexSize: number;
    estimatedMemoryUsage: string;
  } {
    const totalSymbols = this.symbolIndex.size;
    const loadedChunks = this.loadedChunks.size;
    const symbolIndexSize = this.symbolIndex.size;
    const nameIndexSize = this.nameIndex.size;
    
    // Estimate memory usage (rough calculation)
    const estimatedBytes = 
      (symbolIndexSize * 50) + // Symbol index
      (nameIndexSize * 100) +  // Name index
      (loadedChunks * this.CHUNK_SIZE * 200); // Loaded chunks
    
    return {
      totalSymbols,
      loadedChunks,
      maxChunks: this.MAX_LOADED_CHUNKS,
      symbolIndexSize,
      nameIndexSize,
      estimatedMemoryUsage: `${Math.round(estimatedBytes / 1024)} KB`
    };
  }

  /**
   * Clear all loaded chunks (for memory cleanup)
   */
  clearLoadedChunks(): void {
    this.loadedChunks.clear();
    console.log('Cleared all loaded chunks');
  }

  /**
   * Get total number of tickers in database
   */
  getTotalTickers(): number {
    return this.symbolIndex.size;
  }
}
