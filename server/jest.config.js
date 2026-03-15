module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['\\.system\\.spec\\.ts$'],
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testTimeout: 60000,
};
