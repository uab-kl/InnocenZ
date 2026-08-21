/// <reference types="jest" />
/// <reference types="node" />

// Jest sets NODE_ENV=test only when it is UNSET, and Nx injects the repo-root
// .env into every task — where NODE_ENV=development belongs to apps/backend. So
// under `nx run @org/mobile:test` (but not bare `npx jest`) NODE_ENV arrived as
// "development", and React Native's own escape hatch stopped working:
// AnimatedProps.#connectAnimatedView only tolerates a detached view when
// NODE_ENV === 'test', otherwise it throws "Unable to locate attached view in
// the native tree". BootSplash animates on mount with useNativeDriver, so every
// render of <App /> died. Force it here, before Jest loads anything.
process.env.NODE_ENV = 'test';

module.exports = {
  displayName: '@org/mobile',
  preset: 'jest-expo',
  moduleFileExtensions: ['ts', 'js', 'html', 'tsx', 'jsx'],
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  moduleNameMapper: {
    '[.]svg$': '@nx/expo/plugins/jest/svg-mock',
    // react-native-maps resolves a NATIVE TurboModule (RNMapsAirModule) at
    // require() time and Jest has no native binary, so importing it took the
    // WHOLE suite down before any test ran. See src/test-mocks/react-native-maps.js.
    '^react-native-maps$': '<rootDir>/src/test-mocks/react-native-maps.js',
  },
  transform: {
    '[.][jt]sx?$': [
      'babel-jest',
      {
        configFile: __dirname + '/.babelrc.js',
      },
    ],
    '^.+[.](bmp|gif|jpg|jpeg|mp4|png|psd|svg|webp|ttf|otf|m4v|mov|mp4|mpeg|mpg|webm|aac|aiff|caf|m4a|mp3|wav|html|pdf|obj)$':
      require.resolve('jest-expo/src/preset/assetFileTransformer.js'),
  },
  coverageDirectory: '../../coverage/apps/mobile',
};
