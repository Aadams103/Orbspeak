/**
 * Log Collector
 * 
 * Collects logs, errors, and diagnostic information for bug reports.
 * Maintains a rolling buffer of recent logs and errors.
 */

export interface LogEntry {
  timestamp: number;
  level: 'log' | 'error' | 'warn' | 'info' | 'debug';
  message: string;
  data?: unknown;
  stack?: string;
}

export interface DiagnosticInfo {
  appVersion: string;
  buildVersion: string;
  schemaVersion: number;
  os: string;
  userAgent: string;
  screenInfo: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  activeProfileName: string | null;
  activeProfileId: string | null;
  timestamp: number;
  logs: LogEntry[];
  errors: LogEntry[];
  localStorageSize: number;
  sessionStorageSize: number;
}

export class LogCollector {
  private static instance: LogCollector | null = null;
  private logs: LogEntry[] = [];
  private errors: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 log entries
  private maxErrors = 500; // Keep last 500 errors
  private originalConsole: {
    log: typeof console.log;
    error: typeof console.error;
    warn: typeof console.warn;
    info: typeof console.info;
    debug: typeof console.debug;
  };

  private constructor() {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'log-collector.ts:50',message:'LogCollector constructor entry',data:{timestamp:Date.now()},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    // Store original console methods
    this.originalConsole = {
      log: console.log.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
    };

    // Intercept console methods
    this.setupConsoleInterception();
    
    // Intercept unhandled errors
    this.setupErrorInterception();
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'log-collector.ts:65',message:'LogCollector constructor exit',data:{interceptionSetup:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): LogCollector {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'log-collector.ts:70',message:'getInstance called',data:{hasInstance:!!LogCollector.instance},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    if (!LogCollector.instance) {
      LogCollector.instance = new LogCollector();
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/5dc26b30-67de-4c00-b7f1-797bfaa1f758',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'log-collector.ts:73',message:'LogCollector instance created',data:{success:true},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
    }
    return LogCollector.instance;
  }

  /**
   * Setup console interception
   */
  private setupConsoleInterception(): void {
    console.log = (...args: unknown[]) => {
      this.addLog('log', args);
      this.originalConsole.log(...args);
    };

    console.error = (...args: unknown[]) => {
      const entry = this.addLog('error', args);
      this.errors.push(entry);
      if (this.errors.length > this.maxErrors) {
        this.errors.shift();
      }
      this.originalConsole.error(...args);
    };

    console.warn = (...args: unknown[]) => {
      this.addLog('warn', args);
      this.originalConsole.warn(...args);
    };

    console.info = (...args: unknown[]) => {
      this.addLog('info', args);
      this.originalConsole.info(...args);
    };

    console.debug = (...args: unknown[]) => {
      this.addLog('debug', args);
      this.originalConsole.debug(...args);
    };
  }

  /**
   * Setup error interception
   */
  private setupErrorInterception(): void {
    // Intercept unhandled errors
    window.addEventListener('error', (event) => {
      this.addError({
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      });
    });

    // Intercept unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.addError({
        message: `Unhandled Promise Rejection: ${event.reason}`,
        error: event.reason instanceof Error ? event.reason : new Error(String(event.reason)),
      });
    });
  }

  /**
   * Add log entry
   */
  private addLog(level: LogEntry['level'], args: unknown[]): LogEntry {
    const message = args
      .map((arg) => {
        if (arg instanceof Error) {
          return arg.message;
        }
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data: args.length > 1 ? args.slice(1) : undefined,
    };

    // Extract stack trace if available
    if (args[0] instanceof Error && args[0].stack) {
      entry.stack = args[0].stack;
    }

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    return entry;
  }

  /**
   * Add error entry
   */
  private addError(errorInfo: {
    message: string;
    filename?: string;
    lineno?: number;
    colno?: number;
    error?: Error | unknown;
  }): void {
    const error = errorInfo.error instanceof Error 
      ? errorInfo.error 
      : new Error(errorInfo.message);

    const entry: LogEntry = {
      timestamp: Date.now(),
      level: 'error',
      message: errorInfo.message,
      stack: error.stack,
      data: {
        filename: errorInfo.filename,
        lineno: errorInfo.lineno,
        colno: errorInfo.colno,
      },
    };

    this.errors.push(entry);
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
  }

  /**
   * Get logs from last N minutes
   */
  public getRecentLogs(minutes: number = 5): LogEntry[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.logs.filter((log) => log.timestamp >= cutoff);
  }

  /**
   * Get errors from last N minutes
   */
  public getRecentErrors(minutes: number = 5): LogEntry[] {
    const cutoff = Date.now() - minutes * 60 * 1000;
    return this.errors.filter((error) => error.timestamp >= cutoff);
  }

  /**
   * Get all logs
   */
  public getAllLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get all errors
   */
  public getAllErrors(): LogEntry[] {
    return [...this.errors];
  }

  /**
   * Clear all logs
   */
  public clearLogs(): void {
    this.logs = [];
    this.errors = [];
  }

  /**
   * Get diagnostic information
   */
  public async getDiagnosticInfo(options: {
    activeProfileName?: string | null;
    activeProfileId?: string | null;
    appVersion?: string;
    buildVersion?: string;
    schemaVersion?: number;
    minutes?: number;
  }): Promise<DiagnosticInfo> {
    const minutes = options.minutes ?? 5;
    const recentLogs = this.getRecentLogs(minutes);
    const recentErrors = this.getRecentErrors(minutes);

    // Get OS info from user agent
    const userAgent = navigator.userAgent;
    let os = 'Unknown';
    if (userAgent.includes('Win')) os = 'Windows';
    else if (userAgent.includes('Mac')) os = 'macOS';
    else if (userAgent.includes('Linux')) os = 'Linux';
    else if (userAgent.includes('Android')) os = 'Android';
    else if (userAgent.includes('iOS')) os = 'iOS';

    // Calculate storage sizes
    let localStorageSize = 0;
    let sessionStorageSize = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          localStorageSize += localStorage.getItem(key)?.length || 0;
        }
      }
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          sessionStorageSize += sessionStorage.getItem(key)?.length || 0;
        }
      }
    } catch {
      // Ignore storage access errors
    }

    return {
      appVersion: options.appVersion || '1.0.0',
      buildVersion: options.buildVersion || 'unknown',
      schemaVersion: options.schemaVersion || 1,
      os,
      userAgent,
      screenInfo: {
        width: window.screen.width,
        height: window.screen.height,
        devicePixelRatio: window.devicePixelRatio || 1,
      },
      activeProfileName: options.activeProfileName || null,
      activeProfileId: options.activeProfileId || null,
      timestamp: Date.now(),
      logs: recentLogs,
      errors: recentErrors,
      localStorageSize,
      sessionStorageSize,
    };
  }

  /**
   * Format diagnostic info as text
   */
  public formatDiagnosticInfo(info: DiagnosticInfo, userDescription?: string): string {
    const lines: string[] = [];

    lines.push('=== SpeakOrb Diagnostic Report ===');
    lines.push(`Generated: ${new Date(info.timestamp).toISOString()}`);
    lines.push('');
    lines.push('--- System Information ---');
    lines.push(`App Version: ${info.appVersion}`);
    lines.push(`Build Version: ${info.buildVersion}`);
    lines.push(`Schema Version: ${info.schemaVersion}`);
    lines.push(`OS: ${info.os}`);
    lines.push(`User Agent: ${info.userAgent}`);
    lines.push(`Screen: ${info.screenInfo.width}x${info.screenInfo.height} (DPI: ${info.screenInfo.devicePixelRatio})`);
    lines.push(`Active Profile: ${info.activeProfileName || 'None'} (ID: ${info.activeProfileId || 'None'})`);
    lines.push(`LocalStorage Size: ${(info.localStorageSize / 1024).toFixed(2)} KB`);
    lines.push(`SessionStorage Size: ${(info.sessionStorageSize / 1024).toFixed(2)} KB`);
    lines.push('');

    if (userDescription) {
      lines.push('--- User Description ---');
      lines.push(userDescription);
      lines.push('');
    }

    if (info.errors.length > 0) {
      lines.push(`--- Errors (${info.errors.length}) ---`);
      info.errors.forEach((error) => {
        lines.push(`[${new Date(error.timestamp).toISOString()}] ${error.level.toUpperCase()}: ${error.message}`);
        if (error.stack) {
          lines.push(error.stack);
        }
        if (error.data) {
          lines.push(`Data: ${JSON.stringify(error.data, null, 2)}`);
        }
        lines.push('');
      });
    }

    if (info.logs.length > 0) {
      lines.push(`--- Recent Logs (${info.logs.length}) ---`);
      info.logs.slice(-100).forEach((log) => {
        lines.push(`[${new Date(log.timestamp).toISOString()}] ${log.level.toUpperCase()}: ${log.message}`);
        if (log.data) {
          lines.push(`Data: ${JSON.stringify(log.data, null, 2)}`);
        }
      });
    }

    return lines.join('\n');
  }
}

/**
 * Get log collector instance
 */
export function getLogCollector(): LogCollector {
  return LogCollector.getInstance();
}

