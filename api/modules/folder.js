var express = require('express');
var router = express.Router();
var config = require('../config');
var couch = require('./couchdb');
var fs = require('fs');
var Q = require('q');
var rimraf = require('rimraf');
var _ = require('underscore');
var Folder = require('../models/folder');
var Device = require('../models/device');
var fs = require('fs');
var rimraf = require('rimraf');
var serverAuthService = require('../services/PCServerAuthService');
var sync = require('./sync');

var folderIdRegex = new RegExp(/^[a-z0-9]+$/i);

var createFolder = function (req, res, next) {
    var name = req.body.name;
    var public = req.body.public || false;
    if (!name) {
        return res.status(400).send("Missing required field: name");
    }
    var owner = req.pc_user;
    if (!owner) {
        return res.status(401).send('Must be authenticated');
    }
    var users = {};
    users[owner] = {
        access: {
            read: true,
            write: true,
            admin: true
        },
        username: req.pc_username
    }
    var folder = new Folder({
        name: name,
        public: public,
        owner: owner,
        users: users
    });
    var dirpath = config.filesystem.rootdir + '/' + folder.id;
    folder.path = dirpath;

    var fs_deferred = Q.defer();
    var db_deferred = Q.defer();
    var sync_deferred = Q.defer();
    var promises = [fs_deferred.promise, db_deferred.promise, sync_deferred.promise];

    //create directory
    fs.mkdir(dirpath, function (err) {
        if (err) {
            fs_deferred.reject(err);
            return res.status(500).send(err);
        } else {
            fs_deferred.resolve();
        }
    });

    //create syncthing folder
    sync.createFolder(folder).then(function (res) {
        sync_deferred.resolve();
    }, function (err) {
        sync_deferred.reject(err);
        return res.status(500).send(err);
    });


    //save folder in db
    folder.save().then(function () {
        db_deferred.resolve();
    }, function (error) {
        db_deferred.reject(error);
        return res.status(500).send(error);
    });

    //send response when all is complete
    Q.allSettled(promises).then(function (results) {
        var errors = _.compact(_.pluck(results, 'value'));
        if (errors && errors.length > 0) {
            return res.status(500).send(errors);
        } else {
            return res.status(200).send();
        }
    });
}


var updateFolder = function (req, res, next) {
    var id = req.params.folder;
    var userId = req.pc_user;
    var updateData = req.body;
    if (!id) return res.status(400).send('Missing id');
    if (!updateData) return res.status(400).send('Missing folder data');
    var folder = new Folder({ id: id });
    //look-up folder to check for access rights to modify
    folder.fetch().then(function () {
        //check for access
        hasAccess(folder, userId).then(function () {
            //if permission to modify folder, have sync module check for device changes and device access
            sync.updateFolder({
                updateData: updateData,
                folderId: id,
                userId: userId
            }).then(function () {
                return res.status(200).send();
            }, function (error) {
                return res.status(403).send('Error updating folder. ' + error);
            });
        }, function (err) {
            return res.status(403).send('You don\'t have permission to modify this folder.');
        });
    }, function (error) {
        return res.status(403).send('Error accessing folder.' + error);
    });
}

var deleteFolder = function (req, res, next) {
    var folderId = req.params.folder;
    var userId = req.pc_user;
    var promises = [];
    if (!folderId) return res.status(400).send('Missing folder id');
    //get folder
    var folder = new Folder({
        id: folderId
    });
    folder.fetch().then(function () {
        //check for access
        hasAccess(folder, userId).then(function () {
            //remove folder from syncthing
            var sync_deferred = sync.removeFolder(folderId);
            promises.push(sync_deferred);
            if (folder.path) {
                //remove folder and contents from fs
                var fs_deferred = Q.defer();
                rimraf(folder.path, {}, function (err) {
                    if (!err) {
                        fs_deferred.resolve();
                    } else {
                        fs_deferred.reject(err);
                    }
                    ;
                });
                promises.push(fs_deferred.promise);
            }
            //remove from db
            var db_deferred = couch.ddelete({ _id: folder.id, _rev: folder.rev });
            promises.push(db_deferred);

            Q.all(promises).done(function (values) {
                res.status(200).send();
            });
        }, function (err) {
            return res.status(403).send('You don\'t have permission to delete this folder.');
        });
    }, function (error) {
        return res.status(403).send('Error accessing folder');
    });
}

var listFolders = function (req, res, next) {
    var userId = req.pc_user;
    var deviceUsers = [];
    var keys = [userId];

    var viewUrl = "_design/folder/_view/by_user";
    //also look up server user folders if server user is found
    serverAuthService.getDeviceUsers(userId).then(function (users) {
        deviceUsers = users;
    }).fin(function () {
        if (deviceUsers) keys.push.apply(keys, deviceUsers);
        couch.getMulti(viewUrl, keys).then(function (resData) {
            var rows = resData.rows;
            var folders = [];
            for (var i = 0, l = rows.length; i < l; i++) {
                var folder = rows[i];
                folders.push(_.omit(folder.value, ['path', '_rev']));
            }
            return res.status(200).send({
                result: folders
            });
        }, function (error) {
            return res.status(400).send('Error: ' + error);
        });
    });
}

var hasAccess = function (folder, userId) {
    var deferred = Q.defer();
    var deviceUsers;

    serverAuthService.getDeviceUsers(userId).then(function (users) {
        deviceUsers = users;
    }).fin(function () {
        //check for access
        var access = false;
        if (folder.isAdmin(userId) || folder.isOwner(userId)) {
            access = true;
        } else if (deviceUsers) {
            for (var i = 0, l = deviceUsers.length; i < l; i++) {
                var deviceUser = deviceUsers[i];
                if (folder.isAdmin(deviceUser) || folder.isOwner(deviceUser)) {
                    access = true;
                    break;
                }
            }
        }
        //send response
        if (access) {
            return deferred.resolve();
        } else {
            return deferred.reject();
        }
    });
    return deferred.promise;
}

var restrict = function (req, res, next) {
    if (!req.pc_authenticated || !req.pc_username) {
        return res.status(401).send("Authentication error. You must be logged-in to execute this command.");
    }
    next();
}

router.post('/', [restrict, createFolder]);
router.get('/listFolders', [restrict, listFolders]);
router.put('/:folder', [restrict, updateFolder]);
router.delete('/:folder', [restrict, deleteFolder]);


module.exports = router;