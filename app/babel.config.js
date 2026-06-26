// babel-preset-expo includes the expo-router and React Native transforms
// (SDK 50+), so no separate router plugin is needed.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
