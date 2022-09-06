//template for models from CouchDB data
var _ = require('underscore');
var Q = require('q');
var couch = require('../modules/couchdb');
var uuid = require('node-uuid');

function Model(id) {
    this.fetched = false;
    this.saved = false;
    this.data = {};
    if (id) this.data._id = id;
    if (!this.data._id) {
        this.data._id = uuid.v4();
    }
}

Model.prototype.fetch = function () {
    var deferred = Q.defer();
    var that = this;
    if (!this.data._id) return new Error('no id');
    couch.dget(this.data._id).then(function (resData) {
        that.fetched = true;
        _.extend(that.data, resData.data);
        deferred.resolve();
    }, function (error) {
        deferred.reject(error);
    });

    return deferred.promise;
}

Model.prototype.save = function () {
    var deferred = Q.defer();
    var that = this;
    if (this.rev) {
        couch.dupdate(this.data).then(function (resData) {
            that.saved = true;
            deferred.resolve(resData);
        }, function (error) {
            deferred.reject(error);
        });
    } else {
        couch.dinsert(this.data).then(function (resData) {
            that.saved = true;
            deferred.resolve(resData);
        }, function (error) {
            deferred.reject(error);
        });
    }

    return deferred.promise;
}


Model.prototype.delete = function () {
    var deferred = Q.defer();
    var that = this;
    if (this.rev) {
        couch.ddelete(this.data).then(function (resData) {
            that.deleted = true;
            deferred.resolve(resData);
        }, function (error) {
            deferred.reject(error);
        });
    } else {
        couch.dinsert(this.data).then(function (resData) {
            that.saved = true;
            deferred.resolve(resData);
        }, function (error) {
            deferred.reject(error);
        });
    }

    return deferred.promise;
}

Object.defineProperty(Model.prototype, "id", {
    get: function id() {
        return this.data._id;
    }
});

module.exports = Model;