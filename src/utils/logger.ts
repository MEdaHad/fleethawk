import chalk from 'chalk';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel) {
  currentLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export const log = {
  debug: (msg: string, ...args: any[]) => {
    if (shouldLog('debug')) console.log(chalk.gray(`[${timestamp()}] ${msg}`), ...args);
  },
  info: (msg: string, ...args: any[]) => {
    if (shouldLog('info')) console.log(chalk.blue(`🦅 [${timestamp()}]`), msg, ...args);
  },
  warn: (msg: string, ...args: any[]) => {
    if (shouldLog('warn')) console.log(chalk.yellow(`⚠️  [${timestamp()}]`), msg, ...args);
  },
  error: (msg: string, ...args: any[]) => {
    if (shouldLog('error')) console.error(chalk.red(`🔴 [${timestamp()}]`), msg, ...args);
  },
  success: (msg: string, ...args: any[]) => {
    console.log(chalk.green(`✅ [${timestamp()}]`), msg, ...args);
  },
};
