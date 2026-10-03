import path from "node:path";

process.env.DATABASE_URL = `file:${path.join(process.cwd(), "prisma", "test.db")}`;
process.env.AUTH_SECRET = "test-auth-secret-0123456789abcdef";
process.env.SECRETS_ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef";
