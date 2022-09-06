var express = require('express');
var router = express.Router();
var fs = require('fs');
var util = require('util');
var fse = require('fs-extra');
var _ = require('underscore');
var moment = require('moment');
var multipart = require('connect-multiparty');
var mime = require('mime');
var path = require('path');
var config = require('../config');
var Q = require('q');
var Folder = require('../models/folder');
var utils = require('../services/utils');
var serverAuthService = require('../services/PCServerAuthService');

var multipartMiddleware = multipart();
// http://nodejs.org/api.html#_child_processes
var sys = require('sys')
var exec = require('child_process').exec;

var rootdir = config.filesystem.rootdir + '/';

function send_sys_command(request, response, cmd, success) {
    child = exec(cmd, function (error, stdout, stderr) {
        if (error !== null) {
            console.log('exec error: ' + error);
        }
        if (stdout) {
            success(request, response, cmd, stdout);
        } else {
            returnError(response, 'Error: ' + stderr);
        }
    });
}

var restrict = function (req, res, next) {
    //TODO: Restrict access to commands based on ownership
    if (!req.pc_authenticated) {
        return res.status(401).send("Authentication error. You must be logged-in to execute this command.");
    }
    next();
}

//Public file commands, no authorization required
router.post('/', validateDirs, function (request, response, next) {
    if (request.body.params) {
        var params = request.body.params;

        switch (params.mode) {
            case 'list':
                return list(params, response);
                break;
        }
    }
    next();
});

//Restricted file commands. Requires admin account
router.post('/', restrict, validateDirs, multipartMiddleware, function (request, response, next) {
    if (request.body.params) {
        var params = request.body.params;
        switch (params.mode) {
            case 'editfile':
                editfile(params, response);
                break;
            case 'savefile':
                savefile(params, response);
                break;
            case 'rename':
                rename(params, response);
                break;
            case 'copy':
                copy(params, response);
                break;
            case 'delete':
                remove(params, response);
                break;
            case 'addfolder':
                addfolder(params, response);
                break;
            default:
                response.status(404).send("Command not found");
        }
    } else if (request.body.destination && request.files) {
        uploadFiles(request.body.destination, request.files, response);
    }
});
//download - public
router.get('/', validateDirs, function (request, response) {
    if (request.query) {
        var query = request.query;
        if (query.mode == 'download' && query.preview == 'true') {
            previewFile(query, response);
        } else if (query.mode == 'download' && query.preview != 'true') {
            downloadFile(request, response);
        }
    } else {
        returnError(response, 'Command not found');
    }
});

function validateDirs(request, response, next) {
    var userId = request.pc_user;
    var deviceUsers = [];
    var params = request.body.params || request.query;
    var paths = [];
    var promises = [];

    serverAuthService.getDeviceUsers(userId).then(function (users) {
        deviceUsers = users;
    }).fin(function () {
        if (params.newPath) paths.push(params.newPath);
        if (params.path) paths.push(params.path);
        for (var i = 0, l = paths.length; i < l; i++) {
            var path = paths[i];
            var promise = validate(path);
            promises.push(promise);
        }

        Q.all(promises).done(function (values) {
            return next();
        }, function (errors) {
            response.status(403).send("You don't have access to that directory.");
        });
    });

    function validate(path) {
        var deferred = Q.defer();
        path = (path[0] === '/') ? path.substring(1) : path;
        path = utils.removeTrailingSlashes(path);
        if (path) {
            var split = path.split('/');
            if (split.length < 1) return deferred.reject();
            var id = split[0];
            //check on couch for id for directory in folders
            var folder = new Folder({ id: id });
            folder.fetch().then(function () {
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
                //resolve results
                if (access) {
                    response.pathFolder = folder;
                    deferred.resolve();
                } else {
                    deferred.reject('You don\'t have permission to access that folder');
                }
                deferred.resolve();
            }, function (error) {
                deferred.reject('Error loading folder');
            });
        } else {
            deferred.reject('No path specified');
        }

        return deferred.promise;
    }
}

var returnError = function (response, errorMsg) {
    response.send({
        "result": {
            "success": false,
            "error": errorMsg
        }
    });
};

var returnResult = function (response, result) {
    response.send({
        "result": result
    });
};

var returnOK = function (response) {
    response.send({
        "result": {
            "success": true,
            "error": null
        }
    });
};

var uploadFiles = function (destination, files, response) {
    debugger;
    _.each(files, function (file) {
        var readStream = fs.createReadStream(file.path)
        var writeStream = fs.createWriteStream(rootdir + destination + '/' + file.name);
        util.pump(readStream, writeStream, function () {
            fs.unlink(file.path, function (err) {
                if (err) {
                    returnError(response, err);
                } else {
                    returnOK(response);
                }
            });
        });
    });
};

var previewFile = function (params, response) {
    fs.readFile(rootdir + params.path, 'binary', function (err, data) {
        if (err) {
            returnError(response, "Can't open file");
        } else {
            response.end(data, 'binary');
        }
    });
};

var downloadFile = function (request, response) {
    var params = request.query;
    //TODO: Streamed downloads rather than loading whole file into memory
    //http://bnerd.de/2012/03/how-to-serve-large-files-with-node-js/
    fs.readFile(rootdir + params.path, 'binary', function (err, data) {
        if (err) {
            returnError(response, "Can't open file");
        } else {
            response.set('Content-Type', mime.lookup(rootdir + params.path));
            response.set('Content-Disposition', 'attachment; filename=' + path.basename(rootdir + params.path));
            response.end(data, 'binary');
        }
    });
};

var list = function (params, response) {
    var dir = rootdir + params.path;

    fs.readdir(dir, function (err, files) {
        if (err) return returnError(response, 'Error reading folder');

        var result = [];
        var i = files.length;
        if (i == 0) returnResult(response, result);

        _.each(files, function (fileName) {
            //hide system files, such as syncthing .stfolder files
            if (fileName === '.stfolder') {
                i--;
                if (i < 1) {
                    returnResult(response, result);
                }
            } else {
                fs.stat(dir + '/' + fileName, function (err, fileStat) {
                    if (err) {
                        i--;
                    } else {
                        var fileInfo = {
                            "name": fileName,
                            "type": fileStat.isFile() ? 'file' : 'dir',
                            "size": fileStat.size,
                            "date": moment(fileStat.birthtime).format("YYYY-MM-DD HH:mm:ss"),
                            "rights": (fileStat.isFile() ? '-' : 'd') + getFilePermissionByString(fileStat.mode.toString(8).substr(-3))
                        }
                        result.push(fileInfo);
                        i--;
                    }
                    if (i < 1) {
                        returnResult(response, result);
                    }
                });
            }
        })

    });
};


var addfolder = function (params, response) {
    fs.mkdir(rootdir + params.path + '/' + params.name, function (err) {
        if (err) {
            returnError(response, "Can't create new folder");
        } else {
            returnOK(response);
        }
    });
};


var editfile = function (params, response) {
    fs.readFile(rootdir + params.path, 'utf8', function (err, data) {
        if (err) {
            returnError(response, "Can't open file");
        } else {
            returnResult(response, data);
        }
    });
};

var savefile = function (params, response) {
    fs.writeFile(rootdir + params.path, params.content, function (err) {
        if (err) {
            returnError(response, "Can't save file");
        } else {
            returnOK(response);
        }
    });
};

function rename(params, response) {
    if (!params.path || (params.name && !params.newName) || (params.newName && !params.name)) {
        returnError(response, 'Missing required parameters');
    }
    //check if renaming a sync group
    if (params.path && !params.newPath && params.name && params.newName && (params.name !== params.newName) && response.pathFolder) {
        response.pathFolder.name = params.newName;
        response.pathFolder.save().then(function (resData) {
            return returnOK(response);
        }, function (error) {
            return returnError(response, "Can't rename file. " + error);
        });
    } else {
        fs.rename(rootdir + params.path, rootdir + params.newPath, function (err) {
            if (err) {
                returnError(response, "Can't rename file. " + err);
            } else {
                returnOK(response);
            }
        });
    }
};

var copy = function (params, response) {
    fse.copy(rootdir + params.path, rootdir + params.newPath, function (err) {
        if (err) {
            returnError(response, "Can't copy file");
        } else {
            returnOK(response);
        }
    });
};

var remove = function (params, response) {
    fs.stat(rootdir + params.path, function (err, stat) {
        if (err) {
            returnError(response, "Can't delete");
        } else {
            if (stat.isFile()) {
                fs.unlink(rootdir + params.path, function (err) {
                    if (err) {
                        returnError(response, "Can't delete");
                    } else {
                        returnOK(response);
                    }
                });
            } else if (stat.isDirectory()) {
                fse.remove(rootdir + params.path, function (err) {
                    if (err) {
                        returnError(response, "Can't delete");
                    } else {
                        returnOK(response);
                    }
                });
            }
        }
    });

};

var getFilePermissionByString = function (mode) {
    var modes = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
    return modes[mode.substr(0, 1)] + modes[mode.substr(1, 1)] + modes[mode.substr(2, 1)];
};

module.exports = router;
