function loadPage(modulePath) {
  let def = null;
  global.Page = (config) => {
    def = config;
  };
  require(modulePath);
  if (!def) throw new Error(`Page not captured: ${modulePath}`);
  return def;
}

function createPageInstance(def) {
  const page = {
    data: JSON.parse(JSON.stringify(def.data || {})),
    setData: function setData(patch, cb) {
      this.data = {
        ...this.data,
        ...patch,
      };
      if (typeof cb === 'function') cb();
    },
  };

  Object.keys(def).forEach((key) => {
    if (key === 'data') return;
    const val = def[key];
    page[key] = typeof val === 'function' ? val.bind(page) : val;
  });

  return page;
}

module.exports = {
  loadPage,
  createPageInstance,
};
