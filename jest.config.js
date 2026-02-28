module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  clearMocks: true,
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
};
