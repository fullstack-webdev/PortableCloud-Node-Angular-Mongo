var model = require('./modelTemplate');
var couch = require('../modules/couchdb');
var Q = require('q');
var _ = require('underscore');

function Device(params) {
    model.apply(this, [params._id]);

    this.data.doctype = 'device';
    this.data.authorizedUsers = [];
}

Device.prototype = new model();

Object.defineProperty(Device.prototype, "rev", {
    get: function rev() {
        return this.data._rev;
    }
});

Device.prototype.hasAccess = function (userId) {
    return this.data.authorizedUsers && (this.data.authorizedUsers.indexOf(userId) > -1);
}

Device.prototype.addUser = function (userId) {
    if (!this.data.authorizedUsers) return;
    if (this.data.authorizedUsers.indexOf(userId) > -1) return;
    this.data.authorizedUsers.push(userId);
    return true;
}

Device.prototype.removeUser = function (userId) {
    if (!this.data.authorizedUsers) return;
    var i = this.data.authorizedUsers.indexOf(userId);
    if (i < 0) return;
    this.data.authorizedUsers.splice(i, 1);
    return true;
}

Device.prototype.fetchBySyncId = function () {
    var deferred = Q.defer();
    var that = this;
    if (!this.data.syncthingId) {
        deferred.reject('no Syncthing ID');
    } else {
        var query = "_design/device/_view/by_syncid?key=%22" + this.data.syncthingId + "%22";
        couch.dget(query).then(function (resData) {
            that.fetched = true;
            var data = resData && resData.data && resData.data.rows && resData.data.rows[0] && resData.data.rows[0].value;
            if (!data) return deferred.reject('Device config not found');
            _.extend(that.data, data);
            deferred.resolve();
        }, function (error) {
            deferred.reject(error);
        });
    }

    return deferred.promise;
}

module.exports = Device;