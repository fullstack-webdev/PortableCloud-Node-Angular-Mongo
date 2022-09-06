var model = require('./modelTemplate');
var couch = require('../modules/couchdb');
var Q = require('q');
var _ = require('underscore');

function DeviceSession(params) {
    model.apply(this, [params._id]);
    if (params.deviceName) this.deviceName = params.deviceName;
    if (params.syncthingId) this.data.syncthingId = params.syncthingId;
    this.data.doctype = 'deviceSession';
}

DeviceSession.prototype = new model();

Object.defineProperty(DeviceSession.prototype, "rev", {
    get: function rev() {
        return this.data._rev;
    }
});

Object.defineProperty(DeviceSession.prototype, "deviceName", {
    get: function deviceName() {
        return this.data.device_name;
    },
    set: function deviceName(name) {
        this.data.device_name = name;
    }
});

Object.defineProperty(DeviceSession.prototype, "authenticated", {
    get: function authenticated() {
        return this.data.authenticated;
    }
});

DeviceSession.prototype.fetchByDeviceName = function () {
    var deferred = Q.defer();
    var that = this;
    if (!this.deviceName) {
        deferred.reject('no device name');
    } else {
        var query = "_design/deviceSession/_view/by_device_name?key=%22" + this.deviceName + "%22";
        couch.dget(query).then(function (resData) {
            debugger;
            that.fetched = true;
            var data = resData && resData.data && resData.data.rows && resData.data.rows[0] && resData.data.rows[0].value;
            if (!data) return deferred.reject('Device session not found');
            _.extend(that.data, data);
            deferred.resolve();
        }, function (error) {
            deferred.reject(error);
        });
    }

    return deferred.promise;
}

DeviceSession.prototype.fetchBySyncId = function () {
    var deferred = Q.defer();
    var that = this;
    if (!this.data.syncthingId) {
        deferred.reject('no device name');
    } else {
        var query = "_design/deviceSession/_view/by_syncthing_id?key=%22" + this.data.syncthingId + "%22";
        console.log(query);
        couch.dget(query).then(function (resData) {
            debugger;
            that.fetched = true;
            var data = resData && resData.data && resData.data.rows && resData.data.rows[0] && resData.data.rows[0].value;
            if (!data) return deferred.reject('Device session not found');
            _.extend(that.data, data);
            deferred.resolve();
        }, function (error) {
            deferred.reject(error);
        });
    }

    return deferred.promise;
}

module.exports = DeviceSession;