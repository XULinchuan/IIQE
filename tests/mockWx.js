function createMockWx() {
  const storage = new Map();

  const wx = {
    getStorageSync: jest.fn((key) => storage.get(key)),
    setStorageSync: jest.fn((key, value) => {
      storage.set(key, value);
    }),
    removeStorageSync: jest.fn((key) => {
      storage.delete(key);
    }),
    showToast: jest.fn(),
    reLaunch: jest.fn(),
    redirectTo: jest.fn(),
    navigateTo: jest.fn(),
    navigateBack: jest.fn(),
    setNavigationBarTitle: jest.fn(),
    getClipboardData: jest.fn(),
    getUserProfile: jest.fn(),
    chooseMedia: jest.fn(),
    previewImage: jest.fn(),
    cloud: {
      callFunction: jest.fn(),
      uploadFile: jest.fn(),
    },
  };

  wx.__storage = storage;
  return wx;
}

module.exports = {
  createMockWx,
};
