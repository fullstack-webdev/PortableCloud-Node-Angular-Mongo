var _ = require('underscore');
var fs = require('fs');
var Q = require('q');


var utils = function(){};

utils.prototype.removeTrailingSlashes = function(str) {
    return str.replace(/\/+$/, "");
}

utils.prototype.readFile = function(path, options) {
    var deferred = Q.defer();
    fs.readFile(path, options, function(err, data) {
        if (err) return deferred.reject(err);
        return deferred.resolve(data);
    });
    return deferred.promise;
}


module.exports = new utils();