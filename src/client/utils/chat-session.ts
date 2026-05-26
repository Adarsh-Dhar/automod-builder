// src/client/utils/chat-session.ts
// Comprehensive chat session management with retry logic and error handling

export interface ChatSession {
  id: string;
  createdAt: number;
  lastMessageAt: number;
  messageCount: number;
  status: 'active' | 'paused' | 'error';
  error: string | undefined;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  shouldRetry: (error: Error, attempt: number) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  shouldRetry: (error: Error, attempt: number) => {
    const message = error.message.toLowerCase();
    const isRetryable = 
      message.includes('grpc') ||
      message.includes('deadline') ||
      message.includes('timeout') ||
      message.includes('network') ||
      message.includes('connection');
    return isRetryable && attempt < 3;
  },
};

/**
 * ChatSessionManager handles persistent chat sessions with retry logic
 */
export class ChatSessionManager {
  private sessionId: string;
  private sessions: Map<string, ChatSession> = new Map();
  private retryConfig: RetryConfig;

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    this.sessionId = this.generateSessionId();
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    this.initializeSession();
  }

  private generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  private initializeSession(): void {
    const session: ChatSession = {
      id: this.sessionId,
      createdAt: Date.now(),
      lastMessageAt: Date.now(),
      messageCount: 0,
      status: 'active',
      error: undefined,
    };
    this.sessions.set(this.sessionId, session);
    this.saveSessionsToStorage();
  }

  /**
   * Fetch with retry logic and exponential backoff
   */
  async fetchWithRetry<T>(
    url: string,
    options: RequestInit,
    customRetryConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const config = { ...this.retryConfig, ...customRetryConfig };
    let lastError: Error | null = null;
    let delay = config.initialDelayMs;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        console.log(`[ChatSession] Attempt ${attempt + 1}/${config.maxRetries + 1} for ${url}`);

        // Add timeout to fetch
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Handle successful response
        if (response.ok) {
          const data = (await response.json()) as T;
          this.updateSessionSuccess();
          return data;
        }

        // Handle error responses
        if (response.status >= 500) {
          // Server error - retryable
          lastError = new Error(`Server error: ${response.status}`);
          console.error(`[ChatSession] Server error on attempt ${attempt + 1}:`, lastError);
        } else if (response.status === 429) {
          // Rate limited - retryable with longer delay
          lastError = new Error('Rate limited by server');
          delay = Math.min(config.maxDelayMs, delay * 4); // Longer backoff for rate limit
          console.error(`[ChatSession] Rate limited on attempt ${attempt + 1}`);
        } else {
          // Client error - not retryable
          const payload = await response.json().catch(() => ({ message: 'Unknown error' }));
          throw new Error(payload?.message || `HTTP ${response.status}`);
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`[ChatSession] Attempt ${attempt + 1} failed:`, lastError.message);

        // Check if error is retryable
        if (!config.shouldRetry(lastError, attempt)) {
          this.updateSessionError(lastError.message);
          throw lastError;
        }
      }

      // Wait before retry (exponential backoff)
      if (attempt < config.maxRetries) {
        const nextDelay = Math.min(config.maxDelayMs, delay);
        console.log(`[ChatSession] Waiting ${nextDelay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, nextDelay));
        delay = Math.min(config.maxDelayMs, delay * config.backoffMultiplier);
      }
    }

    // All retries exhausted
    this.updateSessionError(lastError?.message || 'Max retries exceeded');
    throw lastError || new Error('Failed after all retries');
  }

  /**
   * Send a chat message with session tracking
   */
  async sendMessage(
    message: string,
    history: Array<{ role: 'user' | 'model'; content: string }>,
    context: {
      subredditContext?: string;
      apiKey?: string;
      blastContext?: string;
    }
  ): Promise<{
    response: string;
    sessionId: string;
    timestamp: number;
    attempt: number;
  }> {
    let attempt = 0;
    const maxAttempts = this.retryConfig.maxRetries + 1;

    while (attempt < maxAttempts) {
      try {
        attempt++;
        console.log(`[ChatSession] Sending message, attempt ${attempt}/${maxAttempts}`);

        const response = await this.fetchWithRetry<any>(
          '/api/rule-stage/chat-unified',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              prompt: message,
              history,
              subredditContext: context.subredditContext,
              apiKey: context.apiKey,
              blastContext: context.blastContext,
              sessionId: this.sessionId, // Include session ID in request
            }),
          }
        );

        const yamlResponse = response.yamlResponse || 'Generated rule...';
        this.updateSession({ messageCount: 1 });
        
        return {
          response: yamlResponse,
          sessionId: this.sessionId,
          timestamp: Date.now(),
          attempt,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[ChatSession] Message send failed on attempt ${attempt}:`, errorMsg);

        // If this is the last attempt, throw the error
        if (attempt >= maxAttempts) {
          this.updateSessionError(errorMsg);
          throw new Error(`Failed to send message after ${maxAttempts} attempts: ${errorMsg}`);
        }

        // Wait before retry
        const delay = Math.min(10000, 1000 * Math.pow(2, attempt - 1));
        console.log(`[ChatSession] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw new Error('Failed to send message');
  }

  /**
   * Get current session status
   */
  getSession(): ChatSession {
    const session = this.sessions.get(this.sessionId);
    if (!session) {
      this.initializeSession();
      return this.sessions.get(this.sessionId)!;
    }
    return session;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Update session on successful message
   */
  private updateSessionSuccess(): void {
    const session = this.getSession();
    session.status = 'active';
    session.lastMessageAt = Date.now();
    session.error = undefined;
    this.saveSessionsToStorage();
  }

  /**
   * Update session on error
   */
  private updateSessionError(error: string): void {
    const session = this.getSession();
    session.status = 'error';
    session.error = error;
    this.saveSessionsToStorage();
  }

  /**
   * Update session data
   */
  private updateSession(updates: Partial<ChatSession>): void {
    const session = this.getSession();
    Object.assign(session, updates);
    session.lastMessageAt = Date.now();
    this.saveSessionsToStorage();
  }

  /**
   * Pause session
   */
  pauseSession(): void {
    const session = this.getSession();
    session.status = 'paused';
    this.saveSessionsToStorage();
  }

  /**
   * Resume session
   */
  resumeSession(): void {
    const session = this.getSession();
    session.status = 'active';
    session.error = undefined;
    this.saveSessionsToStorage();
  }

  /**
   * Reset session for new conversation
   */
  createNewSession(): string {
    this.sessionId = this.generateSessionId();
    this.initializeSession();
    return this.sessionId;
  }

  /**
   * Save sessions to localStorage
   */
  private saveSessionsToStorage(): void {
    try {
      const sessionsObj = Object.fromEntries(this.sessions);
      localStorage.setItem('chat_sessions', JSON.stringify(sessionsObj));
    } catch (error) {
      console.warn('[ChatSession] Failed to save sessions to storage:', error);
    }
  }

  /**
   * Load sessions from localStorage
   */
  loadSessionsFromStorage(): void {
    try {
      const stored = localStorage.getItem('chat_sessions');
      if (stored) {
        const sessionsObj = JSON.parse(stored) as Record<string, ChatSession>;
        this.sessions = new Map(Object.entries(sessionsObj));
        console.log('[ChatSession] Loaded sessions from storage:', this.sessions.size);
      }
    } catch (error) {
      console.warn('[ChatSession] Failed to load sessions from storage:', error);
    }
  }

  /**
   * Clear all sessions
   */
  clearSessions(): void {
    this.sessions.clear();
    localStorage.removeItem('chat_sessions');
    this.initializeSession();
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ChatSession[] {
    return Array.from(this.sessions.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get session history (metadata only)
   */
  getSessionHistory(): Array<{
    id: string;
    createdAt: Date;
    messageCount: number;
    status: string;
    duration: string;
  }> {
    return this.getAllSessions().map(session => {
      const now = Date.now();
      const durationMs = now - session.createdAt;
      const hours = Math.floor(durationMs / 3600000);
      const minutes = Math.floor((durationMs % 3600000) / 60000);
      const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

      return {
        id: session.id,
        createdAt: new Date(session.createdAt),
        messageCount: session.messageCount,
        status: session.status,
        duration,
      };
    });
  }
}

// Export singleton instance for use across the app
let sessionManagerInstance: ChatSessionManager | null = null;

export function getChatSessionManager(): ChatSessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new ChatSessionManager();
    sessionManagerInstance.loadSessionsFromStorage();
  }
  return sessionManagerInstance;
}

export function resetChatSessionManager(): void {
  sessionManagerInstance = null;
}
