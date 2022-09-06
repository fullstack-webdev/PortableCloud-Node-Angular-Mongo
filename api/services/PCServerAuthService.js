var dns = require('dns');
var Q = require('q');
var utils = require('./utils');
var config = require('../config');
var couch = require('../modules/couchdb');

function serverAuthService() {
}


function getRecords(userId) {
    var deferred = Q.defer();
    var records = [];
    var query = "_design/deviceSession/_view/by_user?key=%22" + userId + "%22";
    couch.dget(query).then(function (resData) {
        if (resData && resData.data && resData.data.rows && resData.data.rows.length && resData.data.rows.length > 0) {
            var rows = resData.data.rows;
            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (row.value && row.value.authenticated && row.value.session && row.value.device_user) {
                    //if find a session with matching auth value, set it and continue
                    records.push(row.value);
                }
            }
            return deferred.resolve(records);
        } else {
            return deferred.reject();
        }
    }, function (err) {
        return deferred.reject(err);
    });
    return deferred.promise;
}

function getLinkedDeviceUsers(userId) {
    //get all device users for all linked devices with this PortableCloud.net account
    var deferred = Q.defer();
    var deviceUsers = [];
    getRecords(userId).then(function (records) {
	for (var i = 0, l = records.length; i < l; i++) {
            if (records[i] && records[i].device_user) deviceUsers.push(records[i].device_user);
        }
        deferred.resolve(deviceUsers);
    }, function (err) {
        deferred.resolve(deviceUsers);
    });
    return deferred.promise;
}

serverAuthService.prototype = {
    getDeviceUsers: getLinkedDeviceUsers
}

module.exports = new serverAuthService();
