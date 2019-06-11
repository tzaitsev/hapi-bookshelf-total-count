'use strict';

const Bluebird = require('bluebird');
const Joi      = require('joi');

const ApproximateCountValidator = require('./validators/approximate-count');
const Counter                   = require('./counter');
const Key                       = require('./key');
const TotalCountValidator       = require('./validators/total-count');

exports.register = (server, options, next) => {

  server.ext('onPreResponse', (request, reply) => {
    return exports.executor(request, options)
     .then((countObject) => {
       if (!countObject) {
         return reply.continue();
       }
       if (countObject.approximateCountValid) {
         request.response.source.approximate_count = countObject.count;
       } else {
         request.response.source.total_count = countObject.count;
       }
       return reply.continue();
     }).catch((err) => reply(err));
  });

  next();
};

exports.executor = (request, options = {}) => {
  const settings = request.route.settings.plugins.totalCount;
  const includeApproximate = !settings || !settings.include || settings.include.indexOf('approximate') !== -1;
  const includeTotal = !settings || !settings.include || settings.include.indexOf('total') !== -1;
  const approximateCountValid = includeApproximate ? !Joi.validate(request, ApproximateCountValidator, { allowUnknown: true }).error : false;
  const totalCountValid = includeTotal ? !Joi.validate(request, TotalCountValidator, { allowUnknown: true }).error : false;

  if (!settings || !settings.model || (!approximateCountValid && !totalCountValid)) {
    return Bluebird.resolve();
  }

  const Model = settings.model;
  const Redis = options.redisClient;
  const ttl = options.ttl;
  const key = Key.generate(Model, request, options.uniqueKey);

  return Bluebird.resolve()
      .then(() => {
        if (Redis && approximateCountValid) {
          return Redis.getAsync(key);
        }
      })
      .then((cachedCount) => {
        if (cachedCount) {
          return parseInt(cachedCount);
        }

        return Counter.count(Model, request, Redis, key, ttl);
      })
      .then((count) => {
        return Bluebird.resolve({
          approximateCountValid,
          count
        });
      });
};

exports.register.attributes = {
  pkg: require('../package.json')
};
