module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
    // Pre-existing TS compile errors (unrelated to tests) break coverage instrumentation
    '!src/protectedApi_v8/resource.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['lcov', 'text', 'text-summary'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
}
