var request = require('request');
var sync = require('./sync');

var config = require('../config');
var DeviceSession = require('../models/deviceSession');

//poll regularly to listen for restart events
var lastID = 0;
var events = {
    ONLINE: 'UIOnline',
    OFFLINE: 'UIOffline', // emitted by syncthing process
    CONFIG_SAVED: 'ConfigSaved',   // Emitted after the config has been saved by the user or by Syncthing itself
    DEVICE_CONNECTED: 'DeviceConnected',   // Generated each time a connection to a device has been established
    DEVICE_DISCONNECTED: 'DeviceDisconnected',   // Generated each time a connection to a device has been terminated
    DEVICE_DISCOVERED: 'DeviceDiscovered',   // Emitted when a new device is discovered using local discovery
    DEVICE_REJECTED: 'DeviceRejected',   // Emitted when there is a connection from a device we are not configured to talk to
    DEVICE_PAUSED: 'DevicePaused',   // Emitted when a device has been paused
    DEVICE_RESUMED: 'DeviceResumed',   // Emitted when a device has been resumed
    DOWNLOAD_PROGRESS: 'DownloadProgress',   // Emitted during file downloads for each folder for each file
    FOLDER_COMPLETION: 'FolderCompletion',   //Emitted when the local or remote contents for a folder changes
    FOLDER_REJECTED: 'FolderRejected',   // Emitted when a device sends index information for a folder we do not have, or have but do not share with the device in question
    FOLDER_SUMMARY: 'FolderSummary',   // Emitted when folder contents have changed locally
    ITEM_FINISHED: 'ItemFinished',   // Generated when Syncthing ends synchronizing a file to a newer version
    ITEM_STARTED: 'ItemStarted',   // Generated when Syncthing begins synchronizing a file to a newer version
    LOCAL_INDEX_UPDATED: 'LocalIndexUpdated',   // Generated when the local index information has changed, due to synchronizing one or more items from the cluster or discovering local changes during a scan
    PING: 'Ping',   // Generated automatically every 60 seconds
    REMOTE_INDEX_UPDATED: 'RemoteIndexUpdated',   // Generated each time new index information is received from a device
    STARTING: 'Starting',   // Emitted exactly once, when Syncthing starts, before parsing configuration etc
    STARTUP_COMPLETED: 'StartupCompleted',   // Emitted exactly once, when initialization is complete and Syncthing is ready to start exchanging data with other devices
    STATE_CHANGED: 'StateChanged',   // Emitted when a folder changes state
    FOLDER_ERRORS: 'FolderErrors',   // Emitted when a folder has errors preventing a full sync
    FOLDER_SCAN_PROGRESS: 'FolderScanProgress',// Emitted every ScanProgressIntervalS seconds, indicating how far into the scan it is at.

    //non-syncthing events
    REFRESH_CONNECTIONS: 'RefreshConnections', //Emitted whenever by PCSyncService every time new connection data is pulled
    AUTH_ERROR: "AuthenticationError401"
};

function successFn(data) {
    // When Syncthing restarts while the long polling connection is in
    // progress the browser on some platforms returns a 200 (since the
    // headers has been flushed with the return code 200), with no data.
    // This basically means that the connection has been reset, and the call
    // was not actually successful.
    if (!data) {
        errorFn(data);
        return;
    }
    syncthingEvent(events.ONLINE);

    if (lastID > 0) {   // not emit events from first response
        data.forEach(function (event) {
            //if (debugEvents) {
            //console.log("event", event.id, event.type);//, event.data);
            //}
            syncthingEvent(event.type, event);
        });
    }

    var lastEvent = data.pop();
    if (lastEvent) {
        lastID = lastEvent.id;
    }

    setTimeout(function () {
        request.get({
                url: config.syncthing.url + '/events?since=' + lastID,
                json: true
            },
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    successFn(body)
                } else {
                    errorFn(error);
                }
            });
    }, 500, false);
}

function errorFn(error) {
    syncthingEvent(events.OFFLINE);
    setTimeout(function () {
        request.get({
                url: config.syncthing.url + '/events?limit=1',
                json: true
            },
            function (error, response, body) {
                if (!error && response.statusCode == 200) {
                    successFn(body)
                } else {
                    errorFn(error);
                }
            });
    }, 1000, false);
}

function startSyncthingPolling() {
    request.get({
            url: config.syncthing.url + '/events?limit=1',
            json: true
        },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                successFn(body);
            } else {
                errorFn(error);
            }
        });
}

function syncthingEvent(type, event) {
    switch (type) {
        case 'ConfigSaved':
            restartSyncthing();
            break;
        case 'FolderRejected':
            addFolder(event);
            break;
    }
}
//adds a new folder from Syncthing automatically
function addFolder(event) {
    //console.log(event);
    var syncthingId = event.data.device;
    var folder = event.data.folder;
    if (!folder || !syncthingId) {
        console.log('Error syncthing polling addFolder - missing folder or syncthingId');
        return;
    }
    //TODO: Add approved device to Syncthing
    //check that folder is from device with a valid deviceSession
    var deviceSess = new DeviceSession({ syncthingId: syncthingId });
    //console.log(deviceSess, 'deviceSess');
    deviceSess.fetchBySyncId().then(function () {
        //if (device === serverSyncthingID) {
        if (!deviceSess.fetched) return console.log('Error fetching deviceSession');
        if (!deviceSess.authenticated) return console.log('Device session not authenticated');
        sync.createFolder({ id: folder }, syncthingId).then(function (res) {
            console.log('created syncthing folder successfully');
        }, function(err) {
            console.log(err);
        });
        //add device onto folder
        //}
    });
}

function restartSyncthing() {
    request.get({
            url: config.syncthing.url + '/system/config/insync',
            json: true
        },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var configInSync = body.configInSync;
                if (!configInSync) {
                    console.log("RESTARTING SYNCTHING");
                    request.post({
                        url: config.syncthing.url + '/system/restart',
                        json: true,
                        headers: { 'X-API-Key': config.syncthing.key }
                    }, function(error, response, body) {
                        if (!error && response.statusCode == 200) {
                            console.log('restarted successfully');
                        } else {
                            console.log('restart error: ', error);
                        }
                    });
                }
            } else {
                errorFn(error);
            }
        });
}

//startSyncthingPolling();

module.exports = {
    startSyncthingPolling: startSyncthingPolling
};