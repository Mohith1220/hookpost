/* Frontend unit tests, in jsdom. Run from the repo root:
 *   pnpm exec jest -c apps/frontend/jest.config.ts
 * Specs are *.spec.ts (no JSX) so the frontend tsconfig, which excludes
 * src/**\/*.spec.ts, keeps typechecking without jest's globals. */
export default {
  displayName: 'frontend',
  rootDir: '../..',
  testEnvironment: 'jsdom',
  testEnvironmentOptions: {
    url: 'https://hookpost.hookstep.in/',
  },
  roots: ['<rootDir>/apps/frontend/src'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // Transpile only (isolatedModules). The frontend tsconfig is
        // jsx: preserve for Next, which jest cannot run.
        tsconfig: {
          isolatedModules: true,
          jsx: 'react-jsx',
          module: 'commonjs',
          target: 'es2019',
          esModuleInterop: true,
          allowJs: true,
        },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  moduleNameMapper: {
    '^@hookpost/frontend/(.*)$': '<rootDir>/apps/frontend/src/$1',
    '^@hookpost/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1',
    '^@hookpost/react/(.*)$': '<rootDir>/libraries/react-shared-libraries/src/$1',
    '^@hookpost/nestjs-libraries/(.*)$':
      '<rootDir>/libraries/nestjs-libraries/src/$1',
  },
};
