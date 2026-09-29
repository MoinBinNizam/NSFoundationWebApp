// Keep test fixtures such as NS-GOV-JUNIOR out of the live development data.
process.env.MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/ns-foundation-test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-vitest-integration-32chars!';
