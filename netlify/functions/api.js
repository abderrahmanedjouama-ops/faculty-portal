/**
 * دالة Netlify السحابية (Netlify Serverless Function)
 * تقوم بتغليف خادم الواجهة الخلفية (server.js) عبر مكتبة serverless-http
 * لمعالجة جميع طلبات /api/* ومسارات الإدارة المحمية /admin/* على منصة Netlify.
 */

const serverless = require('serverless-http');
const app = require('../../server');

const serverlessHandler = serverless(app);

exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  return serverlessHandler(event, context);
};
