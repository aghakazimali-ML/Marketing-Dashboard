process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://dash:dash@127.0.0.1:5432/dashboard_test";
process.env.AUTH_SECRET = "test-auth-secret-0123456789abcdef";
process.env.SECRETS_ENCRYPTION_KEY = "test-encryption-key-0123456789abcdef";
