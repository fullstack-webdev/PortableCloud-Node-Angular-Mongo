var express = require('express');
var router = express.Router();
var nodecouchdb = require('node-couchdb');
var config = require('../config.js');
var request = require('request');
var Q = require('q');

var couch = express.couch = express.couch || new nodecouchdb("localhost", 5984);
var db = config.couchdb.database;

var couch_get = function(query, callback) {
    couch.get(db, query, callback);
};

var couchMultikey = function(viewUrl, keys) {
    var deferred = Q.defer();
    var req = {
        url: config.couch_url + '/' + db + '/' + viewUrl,
        json: true,
        body: {
            keys: keys
        }
    };

    request.post(req, function (error, response, body) {
        if (!error && response.statusCode == 200 && body) {
            deferred.resolve(body);
        } else {
            deferred.reject();
        }
    });
    return deferred.promise;
};

var couchGet = function(query) {
    var deferred = Q.defer();
    couch.get(db, query, function(error, resData) {
        if (error) {
            deferred.reject(error);
        } else if (resData.data && resData.data.error) {
            deferred.reject(resData.data.error + ': ' + resData.data.reason);
        } else {
            deferred.resolve(resData);
        }
    });

    return deferred.promise;
};

//TODO: Encode all database inputs

var exists = function(query, callback) {
    couch_get(query, function(err, resData) {
        if (err) {
            callback(err);
            return;
        }
        if (!resData || typeof resData.data === 'undefined' || typeof resData.data.rows === 'undefined') {
            callback("Server error");
            return;
        }
        if (resData.data.rows.length > 0) {
            callback(null, true);
        } else {
            callback(null, false);
        }
    });
};

var deferredExists = function(query, callback) {
	var deferred = Q.defer();

	couchGet(query).then(function(resData) {
		if (!resData || typeof resData.data === 'undefined' || typeof resData.data.rows === 'undefined') {
			deferred.reject("Server error");
			return;
		}
		if (resData.data.rows.length > 0) {
			deferred.resolve(true);
		} else {
			deferred.resolve(false);
		}
	}, function(err) {
		if (err) {
			deferred.reject(err);
			return;
		}
	});

	return deferred.promise;
};

var couch_insert = function(data, callback) {
    couch.insert(db, data, callback);
};


var couchInsert = function(data) {
    var deferred = Q.defer();
    couch.insert(db, data, function(error, resData) {
        if (error) {
            deferred.reject(error);
        } else {
            deferred.resolve(resData);
        }
    });

    return deferred.promise;
};

var couch_update = function(record, callback) {
    if (!record._rev) {
        if (!record._id) return new Error('Record lacks _id');
        couch_get(record._id, function(error, resData) {
            if (error) return new Error(error);
            var data = resData.data;
            if (!data) return new Error("Record _id not found");
            if (!data._rev) return new Error("Record _rev not found");
            record._rev = data._rev;
            couch.update(db, record, callback);
        });
    } else {
        couch.update(db, record, callback);
    }
};

var couchUpdate = function(record) {
    var deferred = Q.defer();
    if (!record._rev) {
        if (!record._id) return new Error('Record lacks _id');
        couchGet(record._id).then(function(resData) {
            var data = resData.data;
            if (!data) return new Error("Record _id not found");
            if (!data._rev) return new Error("Record _rev not found");
            record._rev = data._rev;
            couch.update(db, record, function(error, resData) {
                if (error) return deferred.reject(error);
                deferred.resolve(resData);
            });
        }, function(error) {
            return deferred.reject(error);
        });
    } else {
        couch.update(db, record, function(error, resData) {
            if (error) return deferred.reject(error);
            deferred.resolve(resData);
        });
    }
    return deferred.promise;
};

var couchDelete = function(record) {
    var deferred = Q.defer();
    if (!record._rev || !record._id) {
        if (!record._id) return new Error('Record lacks _id');
        couchGet(record._id).then(function(resData) {
            var data = resData.data;
            if (!data) return new Error("Record _id not found");
            if (!data._rev) return new Error("Record _rev not found");
            record._rev = data._rev;
            couch.del(db, record._id, record._rev, function(error, resData) {
                if (error) {
                    deferred.reject(error);
                } else {
                    deferred.resolve(resData);
                }
            });
        }, function(error) {
            return new Error(error);
        });
    } else {
        couch.del(db, record._id, record._rev, function(error, resData) {
            if (error) {
                deferred.reject(error);
            } else {
                deferred.resolve(resData);
            }
        });
    }
    return deferred.promise;
};

var couch_delete = function(id, rev, callback) {
    if (!rev) {
        if (!id) return new Error('Record lacks _id');
        couch_get(id, function(error, resData) {
            if (error) return new Error(error);
            var data = resData.data;
            if (!data) return new Error("Record _id not found");
            if (!data._rev) return new Error("Record _rev not found");
            rev = data._rev;
            couch.del(db, id, rev, callback);
        });
    } else {
        couch.del(db, id, rev, callback);
    }
};

var deleteAll = function(records, callback) {
    var toDelete = records.length;
    for (var i = 0; i < records.length; i++) {
        var record = records[i];
        couch_delete(record._id, record._rev, function (err, resData) {
            if (err) {
                return new Error(err);
            }
            toDelete--;
            if (toDelete < 1 && callback) this.apply(callback, [true]);
        });
    }
};

module.exports = {
    'dget': couchGet,
    'getMulti': couchMultikey,
    'dinsert': couchInsert,
    'dupdate': couchUpdate,
    'ddelete': couchDelete,
    'get': couch_get,
    'insert': couch_insert,
    'update': couch_update,
    'delete': couch_delete,
    'deleteAll': deleteAll,
    'exists': exists,
	'dexists': deferredExists
};