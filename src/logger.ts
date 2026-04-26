import chalk from 'chalk';

export function step(n: number, total: number, msg: string): void {
  console.log(chalk.cyan(`[${n}/${total}]`) + ' ' + msg);
}

export function success(msg: string): void {
  console.log(chalk.green('✓') + ' ' + msg);
}

export function info(msg: string): void {
  console.log(chalk.blue('→') + ' ' + msg);
}

export function warn(msg: string): void {
  console.log(chalk.yellow('!') + ' ' + msg);
}

export function error(msg: string): void {
  console.error(chalk.red('✗') + ' ' + msg);
}
