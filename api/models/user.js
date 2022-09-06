var model = require('./modelTemplate');
var Q = require('q');
var couch = require('../modules/couchdb');
var serverAuthService = require('../services/PCServerAuthService');

function User(params) {
    model.apply(this, [params.id]);

    this.data.doctype = 'user';
    this.data.username = params.username;
}

User.prototype = new model();

User.prototype.getFolders = function () {
    var deferred = Q.defer();
    var userId = this.id;
    var deviceUsers = [];
    if (!this.id) return deferred.reject('No user id');

    serverAuthService.getDeviceUsers(this.id).then(function (users) {
        deviceUsers = users;
    }).fin(function () {
        var viewUrl = "_design/folder/_view/by_user";
        var keys = [userId];
        if (deviceUsers) keys.push.apply(keys, deviceUsers);
        couch.getMulti(viewUrl, keys).then(function (resData) {
            var rows = resData.rows;
            var folders = [];
            for (var i = 0, l = rows.length; i < l; i++) {
                var folder = rows[i];
                folders.push(folder.value);
            }
            deferred.resolve(folders);
        }, function (error) {
            deferred.reject(error);
        });
    });

    return deferred.promise;
}

User.prototype.getFolderIds = function () {
    var deferred = Q.defer();
    var userId = this.id;
    var deviceUsers = [];
    if (!this.id) return deferred.reject('No user id');

    serverAuthService.getDeviceUsers(this.id).then(function (users) {
        deviceUsers = users;
    }).fin(function () {
        var viewUrl = "_design/folder/_view/by_user";
        var keys = [userId];
        if (deviceUsers) keys.push.apply(keys, deviceUsers);
        couch.getMulti(viewUrl, keys).then(function (resData) {
            var rows = resData.rows;
            var folders = [];
            for (var i = 0, l = rows.length; i < l; i++) {
                var folder = rows[i];
                folders.push(folder.id);
            }
            deferred.resolve(folders);
        }, function (error) {
            deferred.reject(error);
        });
    });
    return deferred.promise;
}

module.exports = User;