import chalk from 'chalk';
import Table from 'cli-table3';
import { CheckResult, CheckStatus } from '../config/types';

export function statusIcon(status: CheckStatus): string {
  switch (status) {
    case 'pass': return chalk.green('✅');
    case 'warn': return chalk.yellow('⚠️');
    case 'fail': return chalk.red('❌');
    case 'info': return chalk.blue('ℹ️');
  }
}

export function colorizeStatus(status: CheckStatus, text: string): string {
  switch (status) {
    case 'pass': return chalk.green(text);
    case 'warn': return chalk.yellow(text);
    case 'fail': return chalk.red(text);
    case 'info': return chalk.blue(text);
  }
}

export function printHeader(title: string): void {
  console.log('');
  console.log(chalk.bold.cyan(`━━━ ${title} ━━━`));
}

export function printCheck(result: CheckResult): void {
  console.log(`  ${statusIcon(result.status)} ${result.name}: ${result.message}`);
  for (const detail of result.details ?? []) {
    console.log(chalk.gray(`     • ${detail}`));
  }
}

export function printSummary(results: CheckResult[]): void {
  const passed = results.filter((r) => r.status === 'pass').length;
  const warned = results.filter((r) => r.status === 'warn').length;
  const failed = results.filter((r) => r.status === 'fail').length;
  console.log('');
  console.log(chalk.bold('Summary:'));
  console.log(`  ${chalk.green(`${passed} passed`)}, ${chalk.yellow(`${warned} warnings`)}, ${chalk.red(`${failed} failures`)}`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

export function printTable(headers: string[], rows: string[][]): void {
  const table = new Table({
    head: headers.map((header) => chalk.bold(header)),
    style: { head: [], border: [] },
    wordWrap: true,
  });
  for (const row of rows) {
    table.push(row);
  }
  console.log(table.toString());
}
