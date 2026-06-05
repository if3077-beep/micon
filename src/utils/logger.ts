import chalk from 'chalk';

export const logger = {
  info: (msg: string) => console.log(chalk.blue('ℹ'), msg),
  success: (msg: string) => console.log(chalk.green('✔'), msg),
  warn: (msg: string) => console.log(chalk.yellow('⚠'), msg),
  error: (msg: string) => console.log(chalk.red('✖'), msg),
  step: (num: number, total: number, msg: string) =>
    console.log(chalk.cyan(`  ${num}/${total}`), msg),
  debug: (msg: string) => {
    if (process.env.MICON_DEBUG) console.log(chalk.gray('🔍'), chalk.gray(msg));
  },
};
