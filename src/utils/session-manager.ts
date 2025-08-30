/**
 * Optimized Session Manager - Consolidated User Session Management
 * 
 * Replaces multiple Maps with a single, efficient data structure
 * to reduce memory usage and improve performance.
 */

import { Stock } from '../types';

export interface VoiceDetectionState {
  isListening: boolean;
  lastTranscriptionTime: number;
  silenceTimeout: NodeJS.Timeout | null;
  consecutiveEmptyTranscriptions: number;
  lastFinalTranscription: string;
}

export interface UserSession {
  watchlist: Stock[];
  refreshInterval: NodeJS.Timeout | null;
  cleanupFunctions: Array<() => void>;
  lastActivity: number;
  voiceState: VoiceDetectionState;
  focusState: { ticker: string; isFocused: boolean } | null;
  displayState: { isShowingStockData: boolean; lastStockDisplayTime: number } | null;
}

export class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<string, UserSession> = new Map();
  private readonly MAX_SESSIONS = 50;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private cleanupTimer: NodeJS.Timeout | null = null;

  private constructor() {
    this.startCleanupTimer();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  /**
   * Create or get a user session
   */
  createSession(userId: string, initialWatchlist: Stock[] = []): UserSession {
    if (this.sessions.has(userId)) {
      return this.sessions.get(userId)!;
    }

    // Check if we need to evict old sessions
    if (this.sessions.size >= this.MAX_SESSIONS) {
      this.evictOldestSession();
    }

    const session: UserSession = {
      watchlist: initialWatchlist,
      refreshInterval: null,
      cleanupFunctions: [],
      lastActivity: Date.now(),
      voiceState: {
        isListening: false,
        lastTranscriptionTime: Date.now(),
        silenceTimeout: null,
        consecutiveEmptyTranscriptions: 0,
        lastFinalTranscription: ''
      },
      focusState: null,
      displayState: null
    };

    this.sessions.set(userId, session);
    console.log(`Created session for user: ${userId}`);
    return session;
  }

  /**
   * Get a user session
   */
  getSession(userId: string): UserSession | null {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActivity = Date.now(); // Update activity
    }
    return session || null;
  }

  /**
   * Update user activity
   */
  updateActivity(userId: string): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastActivity = Date.now();
    }
  }

  /**
   * Set refresh interval for a user
   */
  setRefreshInterval(userId: string, interval: NodeJS.Timeout): void {
    const session = this.sessions.get(userId);
    if (session) {
      // Clear existing interval
      if (session.refreshInterval) {
        clearInterval(session.refreshInterval);
      }
      session.refreshInterval = interval;
    }
  }

  /**
   * Add cleanup function for a user
   */
  addCleanupFunction(userId: string, cleanupFn: () => void): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.cleanupFunctions.push(cleanupFn);
    }
  }

  /**
   * Update watchlist for a user
   */
  updateWatchlist(userId: string, watchlist: Stock[]): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.watchlist = watchlist;
      session.lastActivity = Date.now();
    }
  }

  /**
   * Get watchlist for a user
   */
  getWatchlist(userId: string): Stock[] {
    const session = this.sessions.get(userId);
    return session?.watchlist || [];
  }

  /**
   * Update voice state for a user
   */
  updateVoiceState(userId: string, voiceState: Partial<VoiceDetectionState>): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.voiceState = { ...session.voiceState, ...voiceState };
      session.lastActivity = Date.now();
    }
  }

  /**
   * Get voice state for a user
   */
  getVoiceState(userId: string): VoiceDetectionState | null {
    const session = this.sessions.get(userId);
    return session?.voiceState || null;
  }

  /**
   * Update focus state for a user
   */
  updateFocusState(userId: string, focusState: { ticker: string; isFocused: boolean } | null): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.focusState = focusState;
      session.lastActivity = Date.now();
    }
  }

  /**
   * Get focus state for a user
   */
  getFocusState(userId: string): { ticker: string; isFocused: boolean } | null {
    const session = this.sessions.get(userId);
    return session?.focusState || null;
  }

  /**
   * Update display state for a user
   */
  updateDisplayState(userId: string, displayState: { isShowingStockData: boolean; lastStockDisplayTime: number } | null): void {
    const session = this.sessions.get(userId);
    if (session) {
      session.displayState = displayState;
      session.lastActivity = Date.now();
    }
  }

  /**
   * Get display state for a user
   */
  getDisplayState(userId: string): { isShowingStockData: boolean; lastStockDisplayTime: number } | null {
    const session = this.sessions.get(userId);
    return session?.displayState || null;
  }

  /**
   * Clean up a specific user session
   */
  cleanupSession(userId: string, reason: string): void {
    const session = this.sessions.get(userId);
    if (!session) return;

    console.log(`Cleaning up session for user: ${userId} (${reason})`);

    // Clear refresh interval
    if (session.refreshInterval) {
      clearInterval(session.refreshInterval);
    }

    // Clear voice timeout
    if (session.voiceState.silenceTimeout) {
      clearTimeout(session.voiceState.silenceTimeout);
    }

    // Execute cleanup functions
    session.cleanupFunctions.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.error('Error in cleanup function:', error);
      }
    });

    // Remove from sessions
    this.sessions.delete(userId);
  }

  /**
   * Evict the oldest session
   */
  private evictOldestSession(): void {
    let oldestUserId: string | null = null;
    let oldestTime = Date.now();

    for (const [userId, session] of this.sessions.entries()) {
      if (session.lastActivity < oldestTime) {
        oldestTime = session.lastActivity;
        oldestUserId = userId;
      }
    }

    if (oldestUserId) {
      this.cleanupSession(oldestUserId, 'session_limit_reached');
    }
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Perform cleanup of inactive sessions
   */
  private performCleanup(): void {
    const now = Date.now();
    const sessionsToCleanup: string[] = [];

    for (const [userId, session] of this.sessions.entries()) {
      if (now - session.lastActivity > this.SESSION_TIMEOUT) {
        sessionsToCleanup.push(userId);
      }
    }

    sessionsToCleanup.forEach(userId => {
      this.cleanupSession(userId, 'inactivity_timeout');
    });

    if (sessionsToCleanup.length > 0) {
      console.log(`Cleaned up ${sessionsToCleanup.length} inactive sessions`);
    }
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    maxSessions: number;
    activeSessions: number;
    totalStocks: number;
    averageStocksPerSession: number;
  } {
    const totalSessions = this.sessions.size;
    const totalStocks = Array.from(this.sessions.values())
      .reduce((total, session) => total + session.watchlist.length, 0);
    const averageStocksPerSession = totalSessions > 0 ? totalStocks / totalSessions : 0;

    return {
      totalSessions,
      maxSessions: this.MAX_SESSIONS,
      activeSessions: totalSessions,
      totalStocks,
      averageStocksPerSession: Math.round(averageStocksPerSession * 100) / 100
    };
  }

  /**
   * Stop cleanup timer (for testing or shutdown)
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clear all sessions (for testing or shutdown)
   */
  clearAllSessions(): void {
    const userIds = Array.from(this.sessions.keys());
    userIds.forEach(userId => {
      this.cleanupSession(userId, 'manual_clear');
    });
  }
}
