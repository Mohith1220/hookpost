/* Backend unit tests. Run from the repo root:
 *   pnpm exec jest -c apps/backend/jest.config.ts
 * Specs mock the database layer; nothing here needs Postgres or Redis. */
export default {
  displayName: 'backend',
  rootDir: '../..',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/backend/src'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/apps/backend/tsconfig.build.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@hookpost/backend/(.*)$': '<rootDir>/apps/backend/src/$1',
    '^@hookpost/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
    '^@hookpost/nestjs-libraries/(.*)$':
      '<rootDir>/libraries/nestjs-libraries/src/$1',
  },
};
