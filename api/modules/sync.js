/*
 Backend module to interact with Syncthing sync service
 */
var request = require('request');
var _ = require('underscore');
var concatStream = require('concat-stream');
var Q = require('q');

var config = require('../config');
var deviceService = require('../services/deviceService');
var User = require('../models/user');
//make http calls to Syncthing backend and control access to different Syncthing devices and objects
var syncthing = config.syncthing;
var syncthing_url = config.syncthing.url;
var rootpath = config.filesystem.rootdir;

var folderTemplate = {
  devices: [
    {
      deviceID: syncthing.device
    }
  ],
    readOnly: false,
    rescanIntervalS: 60,
    ignorePerms: false,
    autoNormalize: true,
    minDiskFreePct: 1,
    versioning: { type: '', params: {} },
    copiers: 0,
    pullers: 0,
    hashers: 0,
    order: 'random',
    ignoreDelete: false,
    scanProgressIntervalS: 0,
    pullerSleepS: 0,
    pullerPauseS: 0,
    maxConflicts: -1,
    disableSparseFiles: false,
    invalid: ''
};

var maxBlockTimeSyncthing = 10000; //if syncthing block lasts longer than this, terminate it


var blockQueue = []; //queues config writes, which are staggered such that
// the previous read/write must complete before the next
//read/write

function sync(req, res) {
    var url = req.url;
    if (!req.url || !req.method) {
        return new Error('Malformed request');
    }
    var newUrl = syncthing_url + url;
    //console.log(req.method, req.url);
    //restrict access to authenticated users
    if (!req.pc_authenticated || !req.pc_user) {
        return res.status(401).send("Authentication error. You must be logged-in to execute this command.");
    }
    var userId = req.pc_user;

    if (req.method === 'POST') {
        //check for call-specific over-rides
        switch (req.url) {
            case '/folder':
                createFolder();
                break;
            default:
                if (req.url.indexOf('/system/pause') === 0) {
                    pauseDevice(req);
                } else {
                    res.status(400).send('Updates prohibited from browser');
                }
                break;
        }
    } else if (req.method === 'GET') {
        //check for call-specific over-rides
        switch (req.url) {
            case '/system/config':
                getConfig(false, userId).then(function (data) {
                    res.status(200).send(data);
                }, function (error) {
                    res.status(400).send(error);
                });
                return;
                break;
            case '/system/connections':
                //pipe syncthing requests to syncthing server
                req.pipe(request(newUrl)).pipe(concatStream(function (resBuffer) {
                    var response = resBuffer.toString();
                    var data = JSON.parse(response);
                    filterConnections(data.connections, userId).then(function (filteredConnections) {
                        data.connections = filteredConnections;
                        res.status(200).send(data);
                    }, function (error) {
                        return res.status(403).send('Error filtering connections. ' + error);
                    });
                }));
                return;
                break;
        }
        //filter syncthing responses to event info to remove config updates
        if (req.url.indexOf('/events') === 0) {
            //TODO: Check if other Events need to be filtered for user data
            //see http://docs.syncthing.net/dev/events.html
            req.pipe(request(newUrl)).pipe(concatStream(function (resBuffer) {
                var response = resBuffer.toString();
                var data = JSON.parse(response);
                var taskPromises = [];
                for (var i = 0, l = data.length; i < l; i++) {
                    var event = data[i];
                    if (event.type === 'ConfigSaved') {
                        var deferred = Q.defer();
                        taskPromises.push(deferred.promise);
                        filterConfig(event.data, userId).then(function (filteredConfig) {
                            event.data = filteredConfig;
                            deferred.resolve();
                        }, function (error) {
                            deferred.reject(error);
                        });
                    }
                }
                Q.allSettled(taskPromises).done(function () {
                    res.status(200).send(data);
                }, function (error) {
                    return res.status(403).send('Error filtering config. ' + error);
                });
            }));
        } else {
            //pipe syncthing requests to syncthing server
            req.pipe(request(newUrl)).pipe(res);
        }
    } else {
        res.status(404).send();
    }
}

function pauseDevice(req) {
    var deviceId = req && req.query && req.query.device;
    if (!deviceId) return;

}

function filterConnections(connections, userId) {
    var deferred = Q.defer();
    if (!userId) {
        deferred.reject('User id missing');
    }
    deviceService.getDevices(userId).then(function (userDeviceData) {
        var userDevices = userDeviceData.map(function (data) {
            return data.syncthingId;
        });
        var newConnections = {};
        for (var connection in connections) {
            if ((connection === config.syncthing.device) || (userDevices.indexOf(connection) > -1)) {
                newConnections[connection] = connections[connection];
            }
        }
        deferred.resolve(newConnections);
    }, function (error) {
        deferred.reject(error);
    });
    return deferred.promise;
}

function filterConfig(body, userId) {
    var deferred = Q.defer();
    if (!userId) {
        deferred.reject('User id missing');
        return deferred.promise;
    }
    //filter syncConfig data for what can be shared with user
    var user = new User({ id: userId });
    var syncConfig = _.omit(body, ['version', 'options', 'ignoredDevices', 'gui']);
    syncConfig.ignoredDevices = [];
    user.getFolderIds().then(function (userFolders) {
        syncConfig.folders = _.filter(syncConfig.folders, function (folder) {
            return userFolders.indexOf(folder.id) > -1;
        });
        deviceService.getDevices(userId).then(function (userDeviceData) {
            var userDevices = userDeviceData.map(function (data) {
                return data.syncthingId;
            });
            //only return devices that the user has access to and the server id
            syncConfig.devices = syncConfig.devices.filter(function (device) {
                return (device.deviceID === config.syncthing.device) || (userDevices.indexOf(device.deviceID) > -1);
            });
            //filter folders' devices by devices the user can access as well
            for (var i in syncConfig.folders) {
                var folder = syncConfig.folders[i];
                folder.devices = folder.devices.filter(function (device) {
                    return (device.deviceID === config.syncthing.device) || (userDevices.indexOf(device.deviceID) > -1);
                });
            }
            deferred.resolve(syncConfig);
        }, function (error) {
            deferred.reject(error);
        });
    }, function (error) {
        deferred.reject(error);
    });
    return deferred.promise;
}

function blockOpsComplete(block_deferred) {
    var deferred = Q.defer();
    if (!blockQueue.length) {
        deferred.resolve();
        //console.log('no ops to wait for');
    }

    (function (blockQueue, block_deferred) {

        //console.log('waiting for ops: ', blockQueue);
        Q.allSettled(blockQueue).then(function () {
            var timeout = setTimeout(function () {
                if (block_deferred && block_deferred.promise && (block_deferred.promise.inspect().state !== 'fulfilled')) {
                    block_deferred && block_deferred.resolve();
                    console.log('Blocking operation timed-out');
                }
            }, maxBlockTimeSyncthing);
            //console.log('block ops complete: ', blockQueue);
            deferred.resolve();
        }, function (err) {
            //console.log('block ops complete with error', err);
            clearTimeout(timeout);
            deferred.resolve();
        });

    })(blockQueue.slice(), block_deferred);

    //console.log('adding to block queue');
    if (block_deferred) blockQueue.push(block_deferred.promise);

    return deferred.promise;
}

function getConfig(internal, userId, block_deferred) {
    var deferred = Q.defer();

    function returnError(msg) {
        block_deferred && block_deferred.resolve();
        return deferred.reject(msg);
    }

    blockOpsComplete(block_deferred).then(function () {
            //console.log('getting config');
            request.get(syncthing_url + '/system/config',
                function (error, response, body) {
                    if (!error && response.statusCode == 200) {
                        var syncConfig = JSON.parse(body);
                        //console.log('Just got config data');
                        if (internal) {
                            //for internal use don't filter syncConfig object
                            deferred.resolve(syncConfig);
                        } else {
                            //filter response for only user folders
                            filterConfig(syncConfig, userId).then(function (filteredConfig) {
                                deferred.resolve(filteredConfig);
                            }, function (error) {
                                return returnError(error);
                            });
                        }
                    } else {
                        return returnError(error);
                    }
                }
            );
        }, function (err) {
            return returnError(err);
        }
    );

    return deferred.promise;
}

function saveConfig(syncConfig, block_deferred) {
    var deferred = Q.defer();

    function returnError(msg) {
        block_deferred && block_deferred.resolve();
        return deferred.reject(msg);
    }

    request.post({
        url: syncthing_url + '/system/config',
        headers: { 'X-API-Key': syncthing.key },
        body: JSON.stringify(syncConfig)
    }, function (error, response, body) {
        var needToReturnError = false;
        if (!error && response.statusCode == 200) {
            block_deferred.resolve();
            deferred.resolve();
        } else {
            needToReturnError = true;
        }
        //remove fulfilled promises from blockQueue
        for (var i = blockQueue.length - 1; i >= 0; i--) {
            var promise = blockQueue[i] && blockQueue[i].inspect();
            if (promise && (promise.state === 'fulfilled')) {
                blockQueue.splice(i, 1);
            }
        }

        if (needToReturnError) return returnError(error);
    });

    return deferred.promise;
}

sync.updateFolder = function (options) {
    //called by updateFolder function in folder module, where user access to folder is already checked
    var deferred = Q.defer();
    var userId = options.userId;
    var folderId = options.folderId;
    var updateData = options.updateData;
    //required inputs
    if (!updateData) return deferred.reject('Update data not given');
    if (!folderId) return deferred.reject('Folder id missing');
    if (!userId) return deferred.reject('User id missing');
    //only allow some fields to be updated
    var allowedKeys = ['devices', 'readOnly'];
    updateData = _.pick(updateData, allowedKeys);
    //check for device access, compare with user devices
    if (updateData.devices) {
        deviceService.getDevices(userId).then(function (userDeviceData) {
            var userDeviceMap = {};
            var updateDeviceMap = {};
            var updateDevices = updateData.devices;
            var toRemoveMap = {}; //set to all devices in userDevices but not in updateDevices
            for (var i = 0, l = updateDevices.length; i < l; i++) {
                updateDeviceMap[updateDevices[i]] = true;
            }
            for (var i = 0, l = userDeviceData.length; i < l; i++) {
                var deviceId = userDeviceData[i].syncthingId;
                userDeviceMap[deviceId] = true;
                //if device is in userDevices but not in updateDevices, then is should be removed
                if (!updateDeviceMap[deviceId]) toRemoveMap[deviceId] = true;
            }
            //check for permissions on all devices in updateData (i.e. presence in userDeviceMap
            for (var i = 0, l = updateDevices.length; i < l; i++) {
                var deviceId = updateDevices[i];
                if (!userDeviceMap[deviceId] && (deviceId !== config.syncthing.device)) {
                    return deferred.reject('You don\'t have permission to ' +
                        'add this device.');
                }
            }
            //cycle through folders in syncthing folder config
            var block_deferred = Q.defer();

            function returnError(msg) {
                block_deferred && block_deferred.resolve();
                return deferred.reject(msg);
            }

            getConfig(true, null, block_deferred).then(function (syncConfig) {
                if (!syncConfig.folders) {
                    return returnError('Error parsing request');
                }
                var folder;
                //lookup folder in syncthing
                for (var i = 0, l = syncConfig.folders.length; i < l; i++) {
                    if (syncConfig.folders[i].id === folderId) {
                        folder = syncConfig.folders[i];
                        break;
                    }
                }
                if (!folder) return returnError('Error folder not found');
                //cycle through folder devices
                for (var i = 0, l = folder.devices.length; i < l; i++) {
                    var device = folder.devices[i];
                    //check if should remove
                    if (device && toRemoveMap[device.deviceID]) {
                        folder.devices.splice(i, 1);
                        delete toRemoveMap[device.deviceID];
                    }
                    //check if matches updateDevices, is so, remove from updateDevices
                    if (device && updateDeviceMap[device.deviceID]) {
                        delete updateDeviceMap[device.deviceID];
                    }
                }
                //any remaining devices in updateDevicesMap still need to be added to folder
                for (var deviceId in updateDeviceMap) {
                    folder.devices.push({
                        deviceID: deviceId
                    });
                }
                //apply other updates besides device
                folder = _.extend(folder, _.omit(updateData, ['devices']));
                //save updated config
                saveConfig(syncConfig, block_deferred).then(function () {
                    return deferred.resolve();
                }, function (error) {
                    return returnError(error);
                });
            });
            /*
             Folder.devices:
             --------
             syncConfig: a,c,d
             ==================
             userDevices: a,b,c
             newDevices: a,b
             desiredOutcome: a,b,d
             What do do?
             - user has access to everything in newDevices?
             -> no -> error
             Add if: !syncConfig && userDevices && userUpdate
             Remove if: syncConfig && userDevices && !userUpdate

             To-Add = userAccess && userUpdate
             */

        }, function (error) {
            return deferred.reject(error);
        });
    } else {
        var block_deferred = Q.defer();
        //if no devices just apply remaining folder updates
        function returnError(msg) {
            block_deferred && block_deferred.resolve();
            return deferred.reject(msg);
        }

        getConfig(true, null, block_deferred).then(function (syncConfig) {
            if (!syncConfig.folders) {
                return returnError('Error parsing request');
            }
            var folder;
            for (var i = 0, l = syncConfig.folders.length; i < l; i++) {
                if (syncConfig.folders[i].id === folderId) {
                    folder = syncConfig.folders[i];
                    break;
                }
            }
            if (!folder) return returnError('Configuration settings not found for this folder.');
            //apply other updates besides device
            folder = _.extend(folder, _.omit(updateData, ['devices']));
            //save updated config
            saveConfig(syncConfig, block_deferred).then(function () {
                return deferred.resolve();
            }, function (error) {
                return returnError(error);
            });
        }, function (error) {
            return returnError(error);
        });
    }

    return deferred.promise;
}

sync.createFolder = function (updateData, device) {
    var deferred = Q.defer();

    var block_deferred = Q.defer();

    function returnError(msg) {
        block_deferred && block_deferred.resolve();
        return deferred.reject(msg);
    }

    //access existing syncConfig, pull latest
    getConfig(true, null, block_deferred).then(function (syncConfig) {
        if (!syncConfig.folders) {
            return deferred.reject('Error parsing request');
        }
        //check if folder already exists in syncthing
        for (var i = 0, l = syncConfig.folders.length; i < l; i++) {
            var folder = syncConfig.folders[i];
            if (folder.id === updateData.id) {
                if (device) {
                    //make sure that folder is shared with device it is being sent from if already exists
                    var devices = folder.devices;
                    var dev;
                    for (var ii = 0, ll = devices.length; ii < ll; ii++) {
                        if (devices[ii].deviceID === device) {
                            dev = devices[ii];
                            break;
                        }
                    }
                    if (!dev) {
                        devices.push({ deviceID: device });
                        return saveConfig(syncConfig, block_deferred).then(function () {
                            return deferred.resolve();
                        }, function (error) {
                            return returnError(error);
                        });
                    } else {
                        return returnError('Folder already exists and is currently shared with this device.');
                    }
                } else {
                    return returnError('Folder already exists with this ID.');
                }
            }
        }
        //add new folder to syncConfig
        var newFolder = _.extend({}, folderTemplate, {
            id: updateData.id,
            path: rootpath + '/' + updateData.id
        });

        if (device) newFolder.devices.push({ deviceID: device });

        syncConfig.folders.push(newFolder);
        //save updated syncConfig
        saveConfig(syncConfig, block_deferred).then(function () {
            deferred.resolve();
        }, function (error) {
            return returnError(error);
        });

    }, function (error) {
        return returnError(error);
    });

    return deferred.promise;
}

sync.removeFolder = function (folderId) {
    var deferred = Q.defer();
    var block_deferred = Q.defer();

    function returnError(msg) {
        block_deferred && block_deferred.resolve();
        return deferred.reject(msg);
    }

    getConfig(true, null, block_deferred).then(function (syncConfig) {
        var found = false;
        syncConfig.folders = _.reject(syncConfig.folders, function (folder) {
            if (folder.id === folderId) {
                found = true;
                return true;
            }
        });
        if (found) {
            //save updated syncConfig without existing folder
            saveConfig(syncConfig, block_deferred).then(function () {
                deferred.resolve(found);
            }, function (error) {
                return returnError(error);
            });
        } else {
            deferred.resolve();
        }
    });
}

sync.removeDevice = function (syncthingID) {
    var deferred = Q.defer();
    var block_deferred = Q.defer();

    function returnError(msg) {
        block_deferred && block_deferred.resolve();
        return deferred.reject(msg);
    }

    getConfig(true, null, block_deferred).then(function (syncConfig) {
        var found = false;
        syncConfig.devices = _.reject(syncConfig.devices, function (device) {
            if (device.deviceID === syncthingID) {
                found = true;
                return true;
            }
        });
        if (found) {
            //save updated syncConfig without existing folder
            saveConfig(syncConfig, block_deferred).then(function () {
                deferred.resolve(found);
            }, function (error) {
                return returnError(error);
            });
        } else {
            deferred.resolve();
        }
    });
}

sync.addDevice = function (syncthingID, deviceName) {
    var deferred = Q.defer();
    var block_deferred = Q.defer();

    function returnError(msg) {
        block_deferred && block_deferred.resolve();
        return deferred.reject(msg);
    }

    if (!syncthingID) return deferred.reject('Missing syncthing ID.');
    if (!deviceName) return deferred.reject('Missing device name.');
    getConfig(true, null, block_deferred).then(function (syncConfig) {
        var devices = syncConfig.devices;
        var changed;
        var device;
        for (var i = 0, l = devices.length; i < l; i++) {
            if (devices[i].deviceID === syncthingID) {
                device = devices[i];
                break;
            }
        }
        if (device) {
            //check if name matches
            if (device.name !== deviceName) {
                device.name = deviceName;
                changed = true;
            }
        } else {
            devices.push({
                deviceID: syncthingID,
                name: deviceName,
                addresses: [ 'dynamic' ],
                compression: 'metadata',
                certName: '',
                introducer: false
            });
            changed = true;
        }

        if (changed) {
            //save updated syncConfig without existing folder
            saveConfig(syncConfig, block_deferred).then(function () {
                deferred.resolve();
            }, function (error) {
                return returnError(error);
            });
        }
    });
}

module.exports = sync;