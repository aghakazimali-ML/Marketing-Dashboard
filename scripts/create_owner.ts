/**
 * Create the first owner account from the command line (SEC-3).
 *   npm run create-owner -- --email you@company.com --name "Your Name"
 * The password is read from the OWNER_PASSWORD env var or prompted (input hidden).
 */
import "dotenv/config";
import readline from "node:readline";
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/session";
import { passwordProblem } from "../src/lib/auth/accounts";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      // Mute echo while the password is typed.
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.includes(question)) process.stdout.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  if (await prisma.dashboardOwner.findUnique({ where: { id: 1 } })) {
    console.error("An owner account already exists. Nothing to do.");
    process.exit(1);
  }
  const email = (arg("email") ?? (await ask("Owner email: "))).trim().toLowerCase();
  const name = (arg("name") ?? (await ask("Owner name: "))).trim();
  const password = process.env.OWNER_PASSWORD ?? (await ask("Password (12+ characters): ", true));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    console.error("A valid email and a name are required.");
    process.exit(1);
  }
  const problem = passwordProblem(password);
  if (problem) {
    console.error(problem);
    process.exit(1);
  }
  await prisma.dashboardOwner.create({ data: { id: 1, name, email, passwordHash: await hashPassword(password) } });
  console.log(`Owner account created for ${email}. You can sign in now.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
