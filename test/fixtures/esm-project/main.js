import chalk from 'chalk';
export { createPool } from 'mysql2';

async function dynamicLoad() {
  const parser = await import('@babel/parser'); // Missing from package.json!
}
