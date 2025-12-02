const serverless = require('serverless-http');
const app = require('../../server-jobified');

// Export handler for Netlify Functions
module.exports.handler = serverless(app);
