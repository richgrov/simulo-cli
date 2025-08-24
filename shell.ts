import * as readline from "readline";

export const RED = "\x1b[31m";
export const GREEN = "\x1b[32m";
export const GRAY = "\x1b[90m";
export const RESET = "\x1b[0m";

export async function input(message: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}
