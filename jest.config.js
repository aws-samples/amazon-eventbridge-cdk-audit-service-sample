module.exports = {
  roots: [
    '<rootDir>/lib/'
  ],
  testMatch: [
    '**/*.spec.ts'
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/lib/lambda"
  ],
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  }
};
