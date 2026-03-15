module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '../..',
  testEnvironment: 'node',
  testRegex: '.*\\.system\\.spec\\.ts$',
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  setupFiles: ['<rootDir>/test/config/setup-system-env.ts'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testTimeout: 240000,
};
