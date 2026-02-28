const { createMockWx } = require('./mockWx');

beforeEach(() => {
  global.wx = createMockWx();
  global.getCurrentPages = () => [{}];
  jest.resetModules();
});
