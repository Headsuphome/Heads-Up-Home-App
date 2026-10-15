// Extra settings for the installable app. Expo reads app.json first and passes it in as `config`.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  // Firebase settings let Android phones receive alerts. The build adds this file from a
  // private GitHub secret, so it never needs to be stored in the code.
  const hasFirebase = fs.existsSync(path.join(__dirname, 'google-services.json'));
  return {
    ...config,
    android: {
      ...config.android,
      // Each test build gets a higher number, so a new one installs over the old one.
      versionCode: Number(process.env.BUILD_NUMBER) || 1,
      ...(hasFirebase ? { googleServicesFile: './google-services.json' } : {}),
    },
  };
};
