var config = require('../config');
var couch = require('../modules/couchdb');
var Q = require('q');

var device = function () {

};

device.prototype.getDevices = function (userId) {
    var deferred = Q.defer();
    var query = "_design/device/_view/by_user?key=%22" + userId + "%22";
    couch.dget(query).then(function (resData) {
        var rows = resData.data.rows;
        var devices = [];
        for (var i = 0, l = rows.length; i < l; i++) {
            var device = rows[i].value;
            devices.push(device);
        }
        deferred.resolve(devices);
    }, function (error) {
        deferred.reject(error);
    });
    return deferred.promise;
}

module.exports = new device();

