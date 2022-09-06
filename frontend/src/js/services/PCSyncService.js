(function (angular) {
    'use strict';
    angular.module('PCloudSyncServer').service('PCSyncService', ['$http', '$filter', '$q', '$rootScope', 'syncServerConfig',
        'Notification', 'PCEvents',
        function ($http, $filter, $q, $rootScope, syncServerConfig, Notification, PCEvents) {
            //private/helped definitions
            var prevDate = 0;
            var navigatingAway = false;
            var online = false;
            var restarting = false;
            var that = this;
            var debouncedFuncs = {};

            //public/scope definitions
            this.completion = {};
            this.config = {};
            this.configInSync = true;
            this.connections = {};
            this.errors = [];
            this.model = {};
            this.myID = '';
            this.devices = [];
            this.deviceRejections = {};
            this.folderRejections = {};
            this.protocolChanged = false;
            this.reportData = {};
            this.reportPreview = false;
            this.folders = {};
            this.foldersByPath = {};
            this.seenError = '';
            this.upgradeInfo = null;
            this.deviceStats = {};
            this.folderStats = {};
            this.progress = {};
            this.version = {};
            this.needed = [];
            this.neededTotal = 0;
            this.neededCurrentPage = 1;
            this.neededPageSize = 10;
            this.failed = {};
            this.failedCurrentPage = 1;
            this.failedCurrentFolder = undefined;
            this.failedPageSize = 10;
            this.scanProgress = {};
            this.localStateTotal = {
                bytes: 0,
                files: 0
            };
            this.interval = undefined;

            //easily turn-off logging with this function
            this.log = function() {
                //console.log(arguments);
            };

            this.syncError = function(error) {
                console.log(error);
            };


            $rootScope.$on(PCEvents.ONLINE, function () {
                if (online && !restarting) {
                    return;
                }

                that.log('UIOnline');

                that.refreshSystem();
                that.refreshConfig();
                that.refreshConnectionStats();
                that.refreshDeviceStats();
                that.refreshFolderStats();

                $http.get(syncServerConfig.syncUrl + '/svc/report').success(function (data) {
                    that.reportData = data;
                }).error(that.handleHTTPError);
                //TODO: What does this /system/upgrade endpoint do?
                /*
                 $http.get(syncServerConfig.syncUrl + '/system/upgrade').success(function (data) {
                 that.upgradeInfo = data;
                 }).error(function () {
                 that.upgradeInfo = null;
                 });*/

                online = true;
                restarting = false;
            });
            $rootScope.$on(PCEvents.OFFLINE, function () {
                if (navigatingAway || !online) {
                    return;
                }

                console.log('UIOffline');
                online = false;
                if (!restarting) {
                    $('#networkError').modal();
                }
            });
            $rootScope.$on('HTTPError', function (event, arg) {
                // Emitted when a HTTP call fails. We use the status code to try
                // to figure out what's wrong.

                if (navigatingAway || !online) {
                    return;
                }

                console.log('HTTPError', arg);
                online = false;
                if (!restarting) {
                    if (arg.status === 0) {
                        // A network error, not an HTTP error
                        $rootScope.$emit(PCEvents.OFFLINE);
                    } else if (arg.status >= 400 && arg.status <= 599) {
                        // A genuine HTTP error
                        $('#networkError').modal('hide');
                        $('#restarting').modal('hide');
                        $('#shutdown').modal('hide');
                        $('#httpError').modal();
                    }
                }
            });

            $rootScope.$on(PCEvents.STATE_CHANGED, function (event, arg) {
                var data = arg.data;
                if (that.model[data.folder]) {
                    that.model[data.folder].state = data.to;
                    that.model[data.folder].error = data.error;

                    // If a folder has started syncing, then any old list of
                    // errors is obsolete. We may get a new list of errors very
                    // shortly though.
                    if (data.to === 'syncing') {
                        that.failed[data.folder] = [];
                    }

                    // If a folder has started scanning, then any scan progress is
                    // also obsolete.
                    if (data.to === 'scanning') {
                        delete that.scanProgress[data.folder];
                    }
                }
            });

            $rootScope.$on(PCEvents.LOCAL_INDEX_UPDATED, function (event, arg) {
                that.refreshFolderStats();
            });

            $rootScope.$on(PCEvents.DEVICE_DISCONNECTED, function (event, arg) {
                that.connections[arg.data.id].connected = false;
                that.refreshDeviceStats();
            });

            $rootScope.$on(PCEvents.DEVICE_CONNECTED, function (event, arg) {
                if (!that.connections[arg.data.id]) {
                    that.connections[arg.data.id] = {
                        inbps: 0,
                        outbps: 0,
                        inBytesTotal: 0,
                        outBytesTotal: 0,
                        type: arg.data.type,
                        address: arg.data.addr
                    };
                    that.completion[arg.data.id] = {
                        _total: 100
                    };
                }
            });

            $rootScope.$on(PCEvents.DEVICE_REJECTED, function (event, arg) {
                that.deviceRejections[arg.data.device] = arg;
            });

            $rootScope.$on(PCEvents.DEVICE_PAUSED, function (event, arg) {
                that.connections[arg.data.device].paused = true;
            });

            $rootScope.$on(PCEvents.DEVICE_RESUMED, function (event, arg) {
                that.connections[arg.data.device].paused = false;
            });

            $rootScope.$on(PCEvents.FOLDER_REJECTED, function (event, arg) {
                that.folderRejections[arg.data.folder + "-" + arg.data.device] = arg;
            });

            $rootScope.$on(PCEvents.CONFIG_SAVED, function (event, arg) {
                that.updateLocalConfig(arg.data);

                $http.get(syncServerConfig.syncUrl + '/system/config/insync').success(function (data) {
                    that.configInSync = data.configInSync;
                    if (!that.configInSync) {
                        //that.showRestartModal();
                        console.log("RESTART NEEDED");
                    }
                }).error(function(error) { that.syncError(error); });
            });

            $rootScope.$on(PCEvents.DOWNLOAD_PROGRESS, function (event, arg) {
                var stats = arg.data;
                var progress = {};
                for (var folder in stats) {
                    progress[folder] = {};
                    for (var file in stats[folder]) {
                        var s = stats[folder][file];
                        var reused = 100 * s.reused / s.total;
                        var copiedFromOrigin = 100 * s.copiedFromOrigin / s.total;
                        var copiedFromElsewhere = 100 * s.copiedFromElsewhere / s.total;
                        var pulled = 100 * s.pulled / s.total;
                        var pulling = 100 * s.pulling / s.total;
                        // We try to round up pulling to at least a percent so that it would be at least a bit visible.
                        if (pulling < 1 && pulled + copiedFromElsewhere + copiedFromOrigin + reused <= 99) {
                            pulling = 1;
                        }
                        progress[folder][file] = {
                            reused: reused,
                            copiedFromOrigin: copiedFromOrigin,
                            copiedFromElsewhere: copiedFromElsewhere,
                            pulled: pulled,
                            pulling: pulling,
                            bytesTotal: s.bytesTotal,
                            bytesDone: s.bytesDone
                        };
                    }
                }
                for (folder in that.progress) {
                    if (!(folder in progress)) {
                        if (that.neededFolder == folder) {
                            that.refreshNeed(folder);
                        }
                    } else if (that.neededFolder == folder) {
                        for (var file in that.progress[folder]) {
                            if (!(file in progress[folder])) {
                                that.refreshNeed(folder);
                                break;
                            }
                        }
                    }
                    //refresh all folders in download progress
                    that.refreshNeed(folder);
                }
                that.progress = progress;
                console.log("DownloadProgress", that.progress);
            });

            $rootScope.$on(PCEvents.FOLDER_SUMMARY, function (event, arg) {
                var data = arg.data;
                that.model[data.folder] = data.summary;
                that.recalcLocalStateTotal();
            });

            $rootScope.$on(PCEvents.FOLDER_COMPLETION, function (event, arg) {
                var data = arg.data;
                if (!that.completion[data.device]) {
                    that.completion[data.device] = {};
                }
                that.completion[data.device][data.folder] = data.completion;

                var tot = 0,
                    cnt = 0;
                for (var cmp in that.completion[data.device]) {
                    if (cmp === "_total") {
                        continue;
                    }
                    tot += that.completion[data.device][cmp];
                    cnt += 1;
                }
                that.completion[data.device]._total = tot / cnt;
            });

            $rootScope.$on(PCEvents.FOLDER_ERRORS, function (event, arg) {
                var data = arg.data;
                that.failed[data.folder] = data.errors;
            });

            $rootScope.$on(PCEvents.FOLDER_SCAN_PROGRESS, function (event, arg) {
                var data = arg.data;
                that.scanProgress[data.folder] = {
                    current: data.current,
                    total: data.total,
                    rate: data.rate
                };
                console.log("FolderScanProgress", data);
            });

            var deviceCompare = function(a, b) {
                if (typeof a.name !== 'undefined' && typeof b.name !== 'undefined') {
                    if (a.name < b.name)
                        return -1;
                    return a.name > b.name;
                }
                if (a.deviceID < b.deviceID) {
                    return -1;
                }
                return a.deviceID > b.deviceID;
            };

            var folderCompare = function(a, b) {
                if (a.id < b.id) {
                    return -1;
                }
                return a.id > b.id;
            };

            var folderMap = function(l) {
                var m = {};
                l.forEach(function (r) {
                    m[r.id] = r;
                });
                return m;
            };

            var folderList = function(m) {
                var l = [];
                for (var id in m) {
                    l.push(m[id]);
                }
                l.sort(folderCompare);
                return l;
            };

            var decimals = function(val, num) {
                var digits, decs;

                if (val === 0) {
                    return 0;
                }

                digits = Math.floor(Math.log(Math.abs(val)) / Math.log(10));
                decs = Math.max(0, num - digits);
                return decs;
            };

            var randomString = function(len) {
                var i, result = '', chars = '01234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-';
                for (i = 0; i < len; i++) {
                    result += chars[Math.round(Math.random() * (chars.length - 1))];
                }
                return result;
            };

            var isEmptyObject = function (obj) {
                var name;
                for (name in obj) {
                    return false;
                }
                return true;
            };

            var debounce = function(func, wait) {
                var timeout, args, context, timestamp, result, again;

                var later = function () {
                    var last = Date.now() - timestamp;
                    if (last < wait) {
                        timeout = setTimeout(later, wait - last);
                    } else {
                        timeout = null;
                        if (again) {
                            again = false;
                            result = func.apply(context, args);
                            context = args = null;
                        }
                    }
                };

                return function () {
                    context = this;
                    args = arguments;
                    timestamp = Date.now();
                    var callNow = !timeout;
                    if (!timeout) {
                        timeout = setTimeout(later, wait);
                        result = func.apply(context, args);
                        context = args = null;
                    } else {
                        again = true;
                    }

                    return result;
                };
            };

            this.handleHTTPError = function(error) {
                //used to be:
                that.log(error);
            };
            this.refreshFolder = function(folder) {
                var key = "refreshFolder" + folder;
                if (!debouncedFuncs[key]) {
                    debouncedFuncs[key] = debounce(function () {
                        $http.get(syncServerConfig.syncUrl + '/db/status?folder=' + encodeURIComponent(folder)).success(function (data) {
                            that.model[folder] = data;
                            that.recalcLocalStateTotal();
                        }).error(that.handleHTTPError);
                    }, 1000, true);
                }
                debouncedFuncs[key]();
            };
            this.updateLocalConfig = function (config) {
                var hasConfig = !isEmptyObject(that.config);

                that.config = config;

                that.devices = that.config.devices;
                that.devices.forEach(function (deviceCfg) {
                    that.completion[deviceCfg.deviceID] = {
                        _total: 100
                    };
                });
                that.devices.sort(deviceCompare);
                that.folders = folderMap(that.config.folders);
                Object.keys(that.folders).forEach(function (folder) {
                    that.refreshFolder(folder);
                    that.folders[folder].devices.forEach(function (deviceCfg) {
                        that.refreshCompletion(deviceCfg.deviceID, folder);
                    });
                });
                that.foldersUpdated();

                if (!hasConfig) {
                    //TODO: look into modal this should trigger
                    $rootScope.$emit('ConfigLoaded');
                }
            };
            this.refreshSystem = function() {
                var deferred = $q.defer();
                $http.get(syncServerConfig.syncUrl + '/system/status').success(function (data) {
                    that.myID = data.myID;
                    that.system = data;

                    that.discoveryTotal = data.discoveryMethods;
                    var discoveryFailed = [];
                    for (var disco in data.discoveryErrors) {
                        if (data.discoveryErrors[disco]) {
                            discoveryFailed.push(disco + ": " + data.discoveryErrors[disco]);
                        }
                    }
                    that.discoveryFailed = discoveryFailed;

                    var relaysFailed = [];
                    var relaysTotal = 0;
                    for (var relay in data.relayClientStatus) {
                        if (!data.relayClientStatus[relay]) {
                            relaysFailed.push(relay);
                        }
                        relaysTotal++;
                    }
                    that.relaysFailed = relaysFailed;
                    that.relaysTotal = relaysTotal;

                    that.log("refreshSystem", data);
                    deferred.resolve(data);
                }).error(function (error) {
                    deferred.reject(error);
                });
                return deferred.promise;
            };
            this.recalcLocalStateTotal = function() {
                that.localStateTotal = {
                    bytes: 0,
                    files: 0
                };

                for (var f in that.model) {
                    that.localStateTotal.bytes += that.model[f].localBytes;
                    that.localStateTotal.files += that.model[f].localFiles;
                }
            };
            this.refreshCompletion = function(device, folder) {
                if (device === that.myID) {
                    return;
                }

                $http.get(syncServerConfig.syncUrl + '/db/completion?device=' + device + '&folder=' + encodeURIComponent(folder)).success(function (data) {
                    if (!that.completion[device]) {
                        that.completion[device] = {};
                    }
                    that.completion[device][folder] = data.completion;

                    var tot = 0,
                        cnt = 0;
                    for (var cmp in that.completion[device]) {
                        if (cmp === "_total") {
                            continue;
                        }
                        tot += that.completion[device][cmp];
                        cnt += 1;
                    }
                    that.completion[device]._total = tot / cnt;

                    that.log("refreshCompletion", device, folder, that.completion[device]);
                }).error(that.handleHTTPError);
            };
            this.refreshConnectionStats = function() {
                var deferred = $q.defer();
                $http.get(syncServerConfig.syncUrl + '/system/connections').success(function (data) {
                    var now = Date.now(),
                        td = (now - prevDate) / 1000,
                        id;

                    prevDate = now;
                    try {
                        data.total.inbps = Math.max(0, (data.total.inBytesTotal - that.connectionsTotal.inBytesTotal) / td);
                        data.total.outbps = Math.max(0, (data.total.outBytesTotal - that.connectionsTotal.outBytesTotal) / td);
                    } catch (e) {
                        data.total.inbps = 0;
                        data.total.outbps = 0;
                    }
                    that.connectionsTotal = data.total;

                    data = data.connections;
                    for (id in data) {
                        if (!data.hasOwnProperty(id)) {
                            continue;
                        }
                        try {
                            data[id].inbps = Math.max(0, (data[id].inBytesTotal - that.connections[id].inBytesTotal) / td);
                            data[id].outbps = Math.max(0, (data[id].outBytesTotal - that.connections[id].outBytesTotal) / td);
                        } catch (e) {
                            data[id].inbps = 0;
                            data[id].outbps = 0;
                        }
                    }
                    that.connections = data;
                    that.log("refreshConnections", data);
                    $rootScope.$emit(PCEvents.REFRESH_CONNECTIONS);
                    deferred.resolve(data);
                }).error(function (error) {
                    deferred.reject(error);
                });
                return deferred.promise;
            };
            this.refreshErrors = function() {
                var deferred = $q.defer();
                $http.get(syncServerConfig.syncUrl + '/system/error').success(function (data) {
                    that.errors = data.errors;
                    that.log("refreshErrors", data);
                    deferred.resolve(data);
                }).error(function (error) {
                    deferred.reject(error);
                });
                return deferred.promise;
            };
            this.refreshConfig = function() {
                var deferred = $q.defer();
                $http.get(syncServerConfig.syncUrl + '/system/config').success(function (data) {
                    that.updateLocalConfig(data);
                    that.log("refreshConfig", data);
                    deferred.resolve(data);
                }).error(function(error) {
                    that.handleHTTPError();
                    deferred.reject(error);
                });

                $http.get(syncServerConfig.syncUrl + '/system/config/insync').success(function (data) {
                    that.configInSync = data.configInSync;
                    if (!that.configInSync) {
                        //that.showRestartModal();
                        console.log("RESTART NEEDED");
                    }
                }).error(that.handleHTTPError);
                return deferred.promise;
            };
            this.refreshNeed = function(folder) {
                console.log('calling refreshFolder');
                var url = syncServerConfig.syncUrl + "/db/need?folder=" + encodeURIComponent(folder);
                url += "&page=" + that.neededCurrentPage;
                url += "&perpage=" + that.neededPageSize;
                $http.get(url).success(function (data) {
                    if (that.neededFolder == folder) {
                        that.log("refreshNeed", folder, data);
                        that.parseNeeded(data);
                    }
                }).error(that.handleHTTPError);
                console.log('calling refreshFolder');
                that.refreshFolder(folder);
            };
            this.needAction = function(file) {
                var fDelete = 4096;
                var fDirectory = 16384;

                if ((file.flags & (fDelete + fDirectory)) === fDelete + fDirectory) {
                    return 'rmdir';
                } else if ((file.flags & fDelete) === fDelete) {
                    return 'rm';
                } else if ((file.flags & fDirectory) === fDirectory) {
                    return 'touch';
                } else {
                    return 'sync';
                }
            };
            this.parseNeeded = function(data) {
                var merged = [];
                data.progress.forEach(function (item) {
                    item.type = "progress";
                    item.action = needAction(item);
                    merged.push(item);
                });
                data.queued.forEach(function (item) {
                    item.type = "queued";
                    item.action = needAction(item);
                    merged.push(item);
                });
                data.rest.forEach(function (item) {
                    item.type = "rest";
                    item.action = needAction(item);
                    merged.push(item);
                });
                that.needed = merged;
                that.neededTotal = data.total;
            };
            //TODO
            this.neededPageChanged = function (page) {
                that.neededCurrentPage = page;
                PCSyncService.refreshNeed(that.neededFolder);
            };

            this.neededChangePageSize = function (perpage) {
                that.neededPageSize = perpage;
                PCSyncService.refreshNeed(that.neededFolder);
            };

            this.failedPageChanged = function (page) {
                that.failedCurrentPage = page;
            };

            this.failedChangePageSize = function (perpage) {
                that.failedPageSize = perpage;
            };

            this.refreshDeviceStats = function() {
                debounce(function () {
                    $http.get(syncServerConfig.syncUrl + "/stats/device").success(function (data) {
                        that.deviceStats = data;
                        for (var device in that.deviceStats) {
                            that.deviceStats[device].lastSeen = new Date(that.deviceStats[device].lastSeen);
                            that.deviceStats[device].lastSeenDays = (new Date() - that.deviceStats[device].lastSeen) / 1000 / 86400;
                        }
                        that.log("refreshDeviceStats", data);
                    }).error(that.handleHTTPError);
                }, 2500);
            };
            this.refreshFolderStats = function () {
                var deferred = $q.defer();
                var that = this;
                debounce(function () {
                    $http.get(syncServerConfig.syncUrl + "/stats/folder").success(function (data) {
                        that.folderStats = data;
                        for (var folder in that.folderStats) {
                            if (that.folderStats[folder].lastFile) {
                                that.folderStats[folder].lastFile.at = new Date(that.folderStats[folder].lastFile.at);
                            }
                        }
                        that.log("refreshFolderStats", data);
                        deferred.resolve(that.folderStats);
                    }).error(function (error) {
                        deferred.reject(error);
                    });
                }, 2500);
                return deferred.promise;
            };
            this.refresh = function() {
                that.refreshSystem();
                that.refreshConnectionStats();
                that.refreshErrors();
            };
            this.folderStatus = function (folderCfg) {
                if (typeof folderCfg === 'undefined') {
                    return 'notsynced';
                }
                if (typeof that.model[folderCfg.id] === 'undefined') {
                    return 'unknown';
                }

                // after restart syncthing process state may be empty
                if (!that.model[folderCfg.id].state) {
                    return 'unknown';
                }

                if (folderCfg.devices.length <= 1) {
                    return 'unshared';
                }

                if (that.model[folderCfg.id].invalid) {
                    return 'stopped';
                }

                var state = '' + that.model[folderCfg.id].state;
                if (state === 'error') {
                    return 'stopped'; // legacy, the state is called "stopped" in the GUI
                }
                if (state === 'idle' && that.model[folderCfg.id].needFiles > 0) {
                    return 'outofsync';
                }

                return state;
            };
            this.folderClass = function (folderCfg) {
                var status = that.folderStatus(folderCfg);

                if (status == 'idle') {
                    return 'success';
                }
                if (status == 'syncing' || status == 'scanning') {
                    return 'primary';
                }
                if (status === 'unknown') {
                    return 'info';
                }
                if (status === 'unshared') {
                    return 'warning';
                }
                if (status === 'stopped' || status === 'outofsync' || status === 'error') {
                    return 'danger';
                }
                if (status === 'notsynced') {
                    return '';
                }

                return 'info';
            };
            this.syncPercentage = function (folder) {
                if (typeof that.model[folder] === 'undefined') {
                    return 100;
                }
                if (that.model[folder].globalBytes === 0) {
                    return 100;
                }

                var pct = 1000 * that.model[folder].inSyncBytes / that.model[folder].globalBytes;
                return Math.floor(pct) / 10;
            };
            this.scanPercentage = function (folder) {
                if (!that.scanProgress[folder]) {
                    return undefined;
                }
                var pct = 100 * that.scanProgress[folder].current / that.scanProgress[folder].total;
                return Math.floor(pct);
            };

            this.scanRate = function (folder) {
                if (!that.scanProgress[folder]) {
                    return 0;
                }
                return that.scanProgress[folder].rate;
            };

            this.scanRemaining = function (folder) {
                // Formats the remaining scan time as a string. Includes days and
                // hours only when relevant, resulting in time stamps like:
                // 00m 40s
                // 32m 40s
                // 2h 32m
                // 4d 2h

                var res = [];

                if (!that.scanProgress[folder]) {
                    return "";
                }

                // Calculate remaining bytes and seconds based on our current
                // rate.
                var remainingBytes = that.scanProgress[folder].total - that.scanProgress[folder].current;
                var seconds = remainingBytes / that.scanProgress[folder].rate;

                // Round up to closest ten seconds to avoid flapping too much to
                // and fro.
                seconds = Math.ceil(seconds / 10) * 10;

                // Separate out the number of days.
                var days = 0;
                if (seconds >= 86400) {
                    days = Math.floor(seconds / 86400);
                    res.push('' + days + 'd');
                    seconds = seconds % 86400;
                }

                // Separate out the number of hours.
                var hours = 0;
                if (seconds > 3600) {
                    hours = Math.floor(seconds / 3600);
                    res.push('' + hours + 'h');
                    seconds = seconds % 3600;
                }

                var d = new Date(1970, 0, 1).setSeconds(seconds);

                if (days === 0) {
                    // Format minutes only if we're within a day of completion.
                    var f = $filter('date')(d, "m'm'");
                    res.push(f);
                }

                if (days === 0 && hours === 0) {
                    // Format seconds only when we're within an hour of completion.
                    var f = $filter('date')(d, "ss's'");
                    res.push(f);
                }

                return res.join(' ');
            };

            this.deviceStatus = function (deviceCfg) {
                if (that.deviceFolders(deviceCfg).length === 0) {
                    return 'unused';
                }

                if (typeof that.connections[deviceCfg.deviceID] === 'undefined') {
                    return 'unknown';
                }

                if (that.connections[deviceCfg.deviceID].paused) {
                    return 'paused';
                }

                if (that.connections[deviceCfg.deviceID].connected) {
                    if (that.completion[deviceCfg.deviceID] && that.completion[deviceCfg.deviceID]._total === 100) {
                        return 'insync';
                    } else {
                        return 'syncing';
                    }
                }

                // Disconnected
                return 'disconnected';
            };

            this.deviceClass = function (deviceCfg) {
                if (that.deviceFolders(deviceCfg).length === 0) {
                    // Unused
                    return 'warning';
                }

                if (typeof that.connections[deviceCfg.deviceID] === 'undefined') {
                    return 'info';
                }

                if (that.connections[deviceCfg.deviceID].paused) {
                    return 'default';
                }

                if (that.connections[deviceCfg.deviceID].connected) {
                    if (that.completion[deviceCfg.deviceID] && that.completion[deviceCfg.deviceID]._total === 100) {
                        return 'success';
                    } else {
                        return 'primary';
                    }
                }

                // Disconnected
                return 'info';
            };

            this.deviceAddr = function (deviceCfg) {
                var conn = that.connections[deviceCfg.deviceID];
                if (conn && conn.connected) {
                    return conn.address;
                }
                return '?';
            };

            this.deviceCompletion = function (deviceCfg) {
                var conn = that.connections[deviceCfg.deviceID];
                if (conn) {
                    return conn.completion + '%';
                }
                return '';
            };

            this.findDevice = function (deviceID) {
                var matches = that.devices.filter(function (n) {
                    return n.deviceID == deviceID;
                });
                if (matches.length != 1) {
                    return undefined;
                }
                return matches[0];
            };

            this.deviceName = function (deviceCfg) {
                if (typeof deviceCfg === 'undefined') {
                    return "";
                }
                if (deviceCfg.name) {
                    return deviceCfg.name;
                }
                return deviceCfg.deviceID.substr(0, 6);
            };

            this.thisDeviceName = function () {
                var device = that.thisDevice();
                if (typeof device === 'undefined') {
                    return "(unknown device)";
                }
                if (device.name) {
                    return device.name;
                }
                return device.deviceID.substr(0, 6);
            };

            this.pauseDevice = function (device) {
                $http.post(syncServerConfig.syncUrl + "/system/pause?device=" + device);
            };

            this.resumeDevice = function (device) {
                $http.post(syncServerConfig.syncUrl + "/system/resume?device=" + device);
            };

            this.editSettings = function () {
                // Make a working copy
                that.tmpOptions = angular.copy(that.config.options);
                that.tmpOptions.urEnabled = (that.tmpOptions.urAccepted > 0);
                that.tmpOptions.deviceName = that.thisDevice().name;
                that.tmpOptions.autoUpgradeEnabled = (that.tmpOptions.autoUpgradeIntervalH > 0);
                that.tmpGUI = angular.copy(that.config.gui);
                $('#settings').modal();
            };

            this.saveConfig = function (deferred) {
                var cfg = JSON.stringify(that.config);
                var opts = {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                };
                $http.post(syncServerConfig.syncUrl + '/system/config', cfg, opts).success(function () {
                    $http.get(syncServerConfig.syncUrl + '/system/config/insync').success(function (data) {
                        that.configInSync = data.configInSync;
                        if (deferred) deferred.resolve(data);
                        if (!that.configInSync) {
                            //that.showRestartModal();
                            console.log("RESTART NEEDED");
                        }
                    });
                }).error(function(error) {
                    if (deferred) deferred.reject(error);
                    that.syncError(error);
                });
            };

            this.saveSettings = function () {
                // Make sure something changed
                var changed = !angular.equals(that.config.options, that.tmpOptions) || !angular.equals(that.config.gui, that.tmpGUI);
                if (changed) {
                    // Check if usage reporting has been enabled or disabled
                    if (that.tmpOptions.urEnabled && that.tmpOptions.urAccepted <= 0) {
                        that.tmpOptions.urAccepted = 1000;
                    } else if (!that.tmpOptions.urEnabled && that.tmpOptions.urAccepted > 0) {
                        that.tmpOptions.urAccepted = -1;
                    }

                    // Check if auto-upgrade has been enabled or disabled
                    if (that.tmpOptions.autoUpgradeEnabled) {
                        that.tmpOptions.autoUpgradeIntervalH = that.tmpOptions.autoUpgradeIntervalH || 12;
                    } else {
                        that.tmpOptions.autoUpgradeIntervalH = 0;
                    }

                    // Check if protocol will need to be changed on restart
                    if (that.config.gui.useTLS !== that.tmpGUI.useTLS) {
                        that.protocolChanged = true;
                    }

                    // Apply new settings locally
                    that.thisDevice().name = that.tmpOptions.deviceName;
                    that.config.options = angular.copy(that.tmpOptions);
                    that.config.gui = angular.copy(that.tmpGUI);

                    ['listenAddress', 'globalAnnounceServers'].forEach(function (key) {
                        that.config.options[key] = that.config.options["_" + key + "Str"].split(/[ ,]+/).map(function (x) {
                            return x.trim();
                        });
                    });

                    that.saveConfig();
                }

                $('#settings').modal("hide");
            };

            this.saveAdvanced = function () {
                that.config = that.advancedConfig;
                that.saveConfig();
                $('#advanced').modal("hide");
            };

            this.restart = function () {
                restarting = true;
                Notification.primary('Syncing module is restarting to apply configuration changes.');
                $http.post(syncServerConfig.syncUrl + '/system/restart');
                that.configInSync = true;

                // Switch webpage protocol if needed
                if (that.protocolChanged) {
                    var protocol = 'http';

                    if (that.config.gui.useTLS) {
                        protocol = 'https';
                    }

                    setTimeout(function () {
                        window.location.protocol = protocol;
                    }, 2500);

                    that.protocolChanged = false;
                }
            };

            this.upgrade = function () {
                restarting = true;
                $('#majorUpgrade').modal('hide');
                $('#upgrading').modal();
                $http.post(syncServerConfig.syncUrl + '/system/upgrade').success(function () {
                    $('#restarting').modal();
                    $('#upgrading').modal('hide');
                }).error(function () {
                    $('#upgrading').modal('hide');
                });
            };

            this.upgradeMajor = function () {
                $('#majorUpgrade').modal();
            };

            this.shutdown = function () {
                restarting = true;
                $http.post(syncServerConfig.syncUrl + '/system/shutdown').success(function () {
                    $('#shutdown').modal();
                }).error(function(error) { that.syncError(error); });
                that.configInSync = true;
            };

            this.editDevice = function (deviceCfg) {
                that.currentDevice = $.extend({}, deviceCfg);
                that.editingExisting = true;
                that.currentDevice._addressesStr = deviceCfg.addresses.join(', ');
                that.currentDevice.selectedFolders = {};
                that.deviceFolders(that.currentDevice).forEach(function (folder) {
                    that.currentDevice.selectedFolders[folder] = true;
                });
                that.deviceEditor.$setPristine();
                $('#editDevice').modal();
            };

            this.idDevice = function () {
                $('#idqr').modal('show');
            };

            this.addDevice = function () {
                $http.get(syncServerConfig.syncUrl + '/system/discovery')
                    .success(function (registry) {
                        that.discovery = registry;
                    })
                    .then(function () {
                        that.currentDevice = {
                            _addressesStr: 'dynamic',
                            compression: 'metadata',
                            introducer: false,
                            selectedFolders: {}
                        };
                        that.editingExisting = false;
                        that.deviceEditor.$setPristine();
                        $('#editDevice').modal();
                    });
            };

            this.deleteDevice = function () {
                $('#editDevice').modal('hide');
                if (!that.editingExisting) {
                    return;
                }

                that.devices = that.devices.filter(function (n) {
                    return n.deviceID !== that.currentDevice.deviceID;
                });
                that.config.devices = that.devices;
                // In case we later added the device manually, remove the ignoral
                // record.
                that.config.ignoredDevices = that.config.ignoredDevices.filter(function (id) {
                    return id !== that.currentDevice.deviceID;
                });

                for (var id in that.folders) {
                    that.folders[id].devices = that.folders[id].devices.filter(function (n) {
                        return n.deviceID !== that.currentDevice.deviceID;
                    });
                }

                that.saveConfig();
            };

            this.saveDevice = function () {
                $('#editDevice').modal('hide');
                that.saveDeviceConfig(that.currentDevice);
            };

            this.addNewDeviceID = function (device) {
                var deviceCfg = {
                    deviceID: device,
                    _addressesStr: 'dynamic',
                    compression: 'metadata',
                    introducer: false,
                    selectedFolders: {}
                };
                that.saveDeviceConfig(deviceCfg);
                that.dismissDeviceRejection(device);
            };

            this.saveDeviceConfig = function (deviceCfg) {
                console.log('SAVE DEVICE CONFIG');
                var done, i;
                deviceCfg.addresses = deviceCfg._addressesStr.split(',').map(function (x) {
                    return x.trim();
                });

                done = false;
                for (i = 0; i < that.devices.length; i++) {
                    if (that.devices[i].deviceID === deviceCfg.deviceID) {
                        that.devices[i] = deviceCfg;
                        done = true;
                        break;
                    }
                }

                if (!done) {
                    that.devices.push(deviceCfg);
                }

                that.devices.sort(deviceCompare);
                that.config.devices = that.devices;
                // In case we are adding the device manually, remove the ignoral
                // record.
                that.config.ignoredDevices = that.config.ignoredDevices.filter(function (id) {
                    return id !== deviceCfg.deviceID;
                });

                for (var id in deviceCfg.selectedFolders) {
                    if (deviceCfg.selectedFolders[id]) {
                        var found = false;
                        for (i = 0; i < that.folders[id].devices.length; i++) {
                            if (that.folders[id].devices[i].deviceID == deviceCfg.deviceID) {
                                found = true;
                                break;
                            }
                        }

                        if (!found) {
                            that.folders[id].devices.push({
                                deviceID: deviceCfg.deviceID
                            });
                        }
                    } else {
                        that.folders[id].devices = that.folders[id].devices.filter(function (n) {
                            return n.deviceID != deviceCfg.deviceID;
                        });
                    }
                }

                that.saveConfig();
            };

            this.dismissDeviceRejection = function (device) {
                delete that.deviceRejections[device];
            };

            this.ignoreRejectedDevice = function (device) {
                that.config.ignoredDevices.push(device);
                that.saveConfig();
                that.dismissDeviceRejection(device);
            };

            this.otherDevices = function () {
                return that.devices.filter(function (n) {
                    return n.deviceID !== that.myID;
                });
            };

            this.thisDevice = function () {
                var i, n;

                for (i = 0; i < that.devices.length; i++) {
                    n = that.devices[i];
                    if (n.deviceID === that.myID) {
                        return n;
                    }
                }
            };

            this.allDevices = function () {
                var devices = that.otherDevices();
                devices.push(that.thisDevice());
                return devices;
            };

            this.errorList = function () {
                if (!that.errors) {
                    return [];
                }
                return that.errors.filter(function (e) {
                    return e.when > that.seenError;
                });
            };

            this.clearErrors = function () {
                that.seenError = that.errors[that.errors.length - 1].when;
                $http.post(syncServerConfig.syncUrl + '/system/error/clear');
            };

            this.friendlyDevices = function (str) {
                for (var i = 0; i < that.devices.length; i++) {
                    var cfg = that.devices[i];
                    str = str.replace(cfg.deviceID, that.deviceName(cfg));
                }
                return str;
            };

            this.folderList = function () {
                return folderList(that.folders);
            };

            this.getFolder = function (folderName) {
                var folderArray = folderList(that.folders);
                return [folderArray[0]];
            };

            this.directoryList = [];

            //called if currentFolder may have changed
            this.currentFolderPathChanged = function (newvalue) {
                if (newvalue && newvalue.trim().charAt(0) == '~') {
                    that.currentFolder.path = that.system.tilde + newvalue.trim().substring(1);
                }
                $http.get(syncServerConfig.syncUrl + '/system/browse', {
                    params: { current: newvalue }
                }).success(function (data) {
                    that.directoryList = data;
                }).error(function(error) { that.syncError(error); });
            };


            this.editFolder = function (folderCfg) {
                that.currentFolder = angular.copy(folderCfg);
                if (that.currentFolder.path.slice(-1) == that.system.pathSeparator) {
                    that.currentFolder.path = that.currentFolder.path.slice(0, -1);
                }
                that.currentFolder.selectedDevices = {};
                that.currentFolder.devices.forEach(function (n) {
                    that.currentFolder.selectedDevices[n.deviceID] = true;
                });
                if (that.currentFolder.versioning && that.currentFolder.versioning.type === "trashcan") {
                    that.currentFolder.trashcanFileVersioning = true;
                    that.currentFolder.fileVersioningSelector = "trashcan";
                    that.currentFolder.trashcanClean = +that.currentFolder.versioning.params.cleanoutDays;
                } else if (that.currentFolder.versioning && that.currentFolder.versioning.type === "simple") {
                    that.currentFolder.simpleFileVersioning = true;
                    that.currentFolder.fileVersioningSelector = "simple";
                    that.currentFolder.simpleKeep = +that.currentFolder.versioning.params.keep;
                } else if (that.currentFolder.versioning && that.currentFolder.versioning.type === "staggered") {
                    that.currentFolder.staggeredFileVersioning = true;
                    that.currentFolder.fileVersioningSelector = "staggered";
                    that.currentFolder.staggeredMaxAge = Math.floor(+that.currentFolder.versioning.params.maxAge / 86400);
                    that.currentFolder.staggeredCleanInterval = +that.currentFolder.versioning.params.cleanInterval;
                    that.currentFolder.staggeredVersionsPath = that.currentFolder.versioning.params.versionsPath;
                } else if (that.currentFolder.versioning && that.currentFolder.versioning.type === "external") {
                    that.currentFolder.externalFileVersioning = true;
                    that.currentFolder.fileVersioningSelector = "external";
                    that.currentFolder.externalCommand = that.currentFolder.versioning.params.command;
                } else {
                    that.currentFolder.fileVersioningSelector = "none";
                }
                that.currentFolder.trashcanClean = that.currentFolder.trashcanClean || 0; // weeds out nulls and undefineds
                that.currentFolder.simpleKeep = that.currentFolder.simpleKeep || 5;
                that.currentFolder.staggeredCleanInterval = that.currentFolder.staggeredCleanInterval || 3600;
                that.currentFolder.staggeredVersionsPath = that.currentFolder.staggeredVersionsPath || "";

                // staggeredMaxAge can validly be zero, which we should not replace
                // with the default value of 365. So only set the default if it's
                // actually undefined.
                if (typeof that.currentFolder.staggeredMaxAge === 'undefined') {
                    that.currentFolder.staggeredMaxAge = 365;
                }
                that.currentFolder.externalCommand = that.currentFolder.externalCommand || "";

                that.editingExisting = true;
                that.currentFolderPathChanged(that.currentFolder.path);
                //$('#editFolder').modal();
            };

            this.addFolder = function () {
                that.currentFolder = {
                    selectedDevices: {}
                };
                that.currentFolder.rescanIntervalS = 60;
                that.currentFolder.minDiskFreePct = 1;
                that.currentFolder.maxConflicts = -1;
                that.currentFolder.order = "random";
                that.currentFolder.fileVersioningSelector = "none";
                that.currentFolder.trashcanClean = 0;
                that.currentFolder.simpleKeep = 5;
                that.currentFolder.staggeredMaxAge = 365;
                that.currentFolder.staggeredCleanInterval = 3600;
                that.currentFolder.staggeredVersionsPath = "";
                that.currentFolder.externalCommand = "";
                that.currentFolder.autoNormalize = true;
                that.editingExisting = false;
                //$('#editFolder').modal();
                that.currentFolderPathChanged(that.currentFolder.path);
            };

            this.addFolderAndShare = function (folder, device) {
                that.dismissFolderRejection(folder, device);
                that.currentFolder = {
                    id: folder,
                    selectedDevices: {},
                    rescanIntervalS: 60,
                    minDiskFreePct: 1,
                    maxConflicts: -1,
                    order: "random",
                    fileVersioningSelector: "none",
                    trashcanClean: 0,
                    simpleKeep: 5,
                    staggeredMaxAge: 365,
                    staggeredCleanInterval: 3600,
                    staggeredVersionsPath: "",
                    externalCommand: "",
                    autoNormalize: true
                };
                that.currentFolder.selectedDevices[device] = true;

                that.editingExisting = false;
                that.folderEditor.$setPristine();
                $('#editFolder').modal();
                that.currentFolderPathChanged(that.currentFolder.path);
            };

            this.shareFolderWithDevice = function (folder, device) {
                console.log('share folder with device');
                that.folders[folder].devices.push({
                    deviceID: device
                });
                that.config.folders = folderList(that.folders);
                that.saveConfig();
                that.dismissFolderRejection(folder, device);
            };

            this.saveFolder = function (currentFolder) {
                var deferred = $q.defer();
                var folderCfg, done, i;

                folderCfg = currentFolder || that.currentFolder;
                var oldDevices = folderCfg.devices.map(function(obj) {
                    return obj.deviceID;
                });
                var devicesChanged = false;
                var newDevices = [];

                folderCfg.selectedDevices[that.myID] = true;
                for (var deviceID in folderCfg.selectedDevices) {
                    if (folderCfg.selectedDevices[deviceID] === true) {
                        newDevices.push(deviceID);
                        //check for new devices added
                        if (oldDevices.indexOf(deviceID) < 0) devicesChanged = true;
                    }
                }

                //check for devices removed
                for (var i = 0, l = oldDevices.length; i < l; i++) {
                    var oldDevID = oldDevices[i];
                    if (newDevices.indexOf(oldDevID) < 0) devicesChanged = true;
                }
                //delete folderCfg.selectedDevices;
                /*
                if (folderCfg.fileVersioningSelector === "trashcan") {
                    folderCfg.versioning = {
                        'Type': 'trashcan',
                        'Params': {
                            'cleanoutDays': '' + folderCfg.trashcanClean
                        }
                    };
                    delete folderCfg.trashcanFileVersioning;
                    delete folderCfg.trashcanClean;
                } else if (folderCfg.fileVersioningSelector === "simple") {
                    folderCfg.versioning = {
                        'Type': 'simple',
                        'Params': {
                            'keep': '' + folderCfg.simpleKeep
                        }
                    };
                    delete folderCfg.simpleFileVersioning;
                    delete folderCfg.simpleKeep;
                } else if (folderCfg.fileVersioningSelector === "staggered") {
                    folderCfg.versioning = {
                        'type': 'staggered',
                        'params': {
                            'maxAge': '' + (folderCfg.staggeredMaxAge * 86400),
                            'cleanInterval': '' + folderCfg.staggeredCleanInterval,
                            'versionsPath': '' + folderCfg.staggeredVersionsPath
                        }
                    };
                    delete folderCfg.staggeredFileVersioning;
                    delete folderCfg.staggeredMaxAge;
                    delete folderCfg.staggeredCleanInterval;
                    delete folderCfg.staggeredVersionsPath;

                } else if (folderCfg.fileVersioningSelector === "external") {
                    folderCfg.versioning = {
                        'Type': 'external',
                        'Params': {
                            'command': '' + folderCfg.externalCommand
                        }
                    };
                    delete folderCfg.externalFileVersioning;
                    delete folderCfg.externalCommand;
                } else {
                    delete folderCfg.versioning;
                }
                */
                var data = {
                    readOnly: folderCfg.readOnly
                };
                if (devicesChanged) data.devices = newDevices;

                $http.put(syncServerConfig.apiUrl + '/folder/' + folderCfg.id, data).success(function (data) {
                    that.folders[folderCfg.id] = folderCfg;
                    that.config.folders = folderList(that.folders);
                    deferred.resolve(data);
                }).error(function (error) {
                    deferred.reject(error);
                });

                return deferred.promise;
            };

            this.dismissFolderRejection = function (folder, device) {
                delete that.folderRejections[folder + "-" + device];
            };

            this.sharesFolder = function (folderCfg) {
                var names = [];
                folderCfg.devices.forEach(function (device) {
                    if (device.deviceID != that.myID) {
                        names.push(that.deviceName(that.findDevice(device.deviceID)));
                    }
                });
                names.sort();
                return names.join(", ");
            };

            this.deviceFolders = function (deviceCfg) {
                var folders = [];
                for (var folderID in that.folders) {
                    var devices = that.folders[folderID].devices;
                    for (var i = 0; i < devices.length; i++) {
                        if (devices[i].deviceID == deviceCfg.deviceID) {
                            folders.push(folderID);
                            break;
                        }
                    }
                }

                folders.sort();
                return folders;
            };

            this.deleteFolder = function (id) {
                $('#editFolder').modal('hide');
                if (!that.editingExisting) {
                    return;
                }

                delete that.folders[id];
                delete that.model[id];
                that.config.folders = folderList(that.folders);
                recalcLocalStateTotal();

                that.saveConfig();
            };

            this.editIgnores = function () {
                if (!that.editingExisting) {
                    return;
                }

                $('#editIgnoresButton').attr('disabled', 'disabled');
                $http.get(syncServerConfig.syncUrl + '/db/ignores?folder=' + encodeURIComponent(that.currentFolder.id))
                    .success(function (data) {
                        data.ignore = data.ignore || [];

                        $('#editFolder').modal('hide')
                            .one('hidden.bs.modal', function () {
                                var textArea = $('#editIgnores textarea');

                                textArea.val(data.ignore.join('\n'));

                                $('#editIgnores').modal()
                                    .one('hidden.bs.modal', function () {
                                        $('#editFolder').modal();
                                    })
                                    .one('shown.bs.modal', function () {
                                        textArea.focus();
                                    });
                            });
                    })
                    .then(function () {
                        $('#editIgnoresButton').removeAttr('disabled');
                    });
            };

            this.saveIgnores = function () {
                if (!that.editingExisting) {
                    return;
                }

                $http.post(syncServerConfig.syncUrl + '/db/ignores?folder=' + encodeURIComponent(that.currentFolder.id), {
                    ignore: $('#editIgnores textarea').val().split('\n')
                });
            };

            this.setAPIKey = function (cfg) {
                cfg.apiKey = randomString(32);
            };

            this.showURPreview = function () {
                $('#settings').modal('hide')
                    .one('hidden.bs.modal', function () {
                        $('#urPreview').modal()
                            .one('hidden.bs.modal', function () {
                                $('#settings').modal();
                            });
                    });
            };

            this.acceptUR = function () {
                that.config.options.urAccepted = 1000; // Larger than the largest existing report version
                that.saveConfig();
                $('#ur').modal('hide');
            };

            this.declineUR = function () {
                that.config.options.urAccepted = -1;
                that.saveConfig();
                $('#ur').modal('hide');
            };

            this.showNeed = function (folder) {
                that.neededFolder = folder;
                refreshNeed(folder);
                $('#needed').modal().on('hidden.bs.modal', function () {
                    that.neededFolder = undefined;
                    that.needed = undefined;
                    that.neededTotal = 0;
                    that.neededCurrentPage = 1;
                });
            };

            this.showFailed = function (folder) {
                that.failedCurrent = that.failed[folder];
                $('#failed').modal().on('hidden.bs.modal', function () {
                    that.failedCurrent = undefined;
                });
            };

            this.hasFailedFiles = function (folder) {
                if (!that.failed[folder]) {
                    return false;
                }
                if (that.failed[folder].length === 0) {
                    return false;
                }
                return true;
            };

            this.override = function (folder) {
                $http.post(syncServerConfig.syncUrl + "/db/override?folder=" + encodeURIComponent(folder));
            };

            this.about = function () {
                $('#about').modal('show');
            };

            this.advanced = function () {
                that.advancedConfig = angular.copy(that.config);
                $('#advanced').modal('show');
            };

            this.showReportPreview = function () {
                that.reportPreview = true;
            };

            this.rescanAllFolders = function () {
                $http.post(syncServerConfig.syncUrl + "/db/scan");
            };

            this.rescanFolder = function (folder) {
                $http.post(syncServerConfig.syncUrl + "/db/scan?folder=" + encodeURIComponent(folder));
            };

            this.bumpFile = function (folder, file) {
                var url = syncServerConfig.syncUrl + "/db/prio?folder=" + encodeURIComponent(folder) + "&file=" + encodeURIComponent(file);
                // In order to get the right view of data in the response.
                url += "&page=" + that.neededCurrentPage;
                url += "&perpage=" + that.neededPageSize;
                $http.post(url).success(function (data) {
                    if (that.neededFolder == folder) {
                        console.log("bumpFile", folder, data);
                        parseNeeded(data);
                    }
                }).error(function(error) { that.syncError(error); }  );
            };

            this.versionString = function () {
                if (!that.version.version) {
                    return '';
                }

                var os = {
                    'darwin': 'Mac OS X',
                    'dragonfly': 'DragonFly BSD',
                    'freebsd': 'FreeBSD',
                    'openbsd': 'OpenBSD',
                    'netbsd': 'NetBSD',
                    'linux': 'Linux',
                    'windows': 'Windows',
                    'solaris': 'Solaris'
                }[that.version.os] || that.version.os;

                var arch = {
                    '386': '32 bit',
                    'amd64': '64 bit',
                    'arm': 'ARM',
                }[that.version.arch] || that.version.arch;

                return that.version.version + ', ' + os + ' (' + arch + ')';
            };

            this.inputTypeFor = function (key, value) {
                if (key.substr(0, 1) === '_') {
                    return 'skip';
                }
                if (typeof value === 'number') {
                    return 'number';
                }
                if (typeof value === 'boolean') {
                    return 'checkbox';
                }
                if (typeof value === 'object') {
                    return 'skip';
                }
                return 'text';
            };

            this.startPolling = function () {
                that.log('starting Syncthing polling');
                that.interval = setInterval(that.refresh, 10000);
                PCEvents.start();
            };

            this.stopPolling = function () {
                clearInterval(this.interval);
                that.log('stopping Syncthing polling');
            };

            //should be called whenever this.folders is updated, so other data structures can be updated derived from folders
            this.foldersUpdated = function() {
                //rebuild foldersByPath
                that.foldersByPath = {};
                for (var folderID in that.folders) {
                    var path = that.folders[folderID].path;
                    //remove trailing slash
                    if (path.lastIndexOf('/') === path.length - 1) {
                        path = path.substring(0, path.lastIndexOf('/'));
                    }
                    //only keep last part of filename
                    if (path.lastIndexOf('/')) {
                        path = path.substring(path.lastIndexOf('/') + 1, path.length);
                    }
                    that.foldersByPath[path] = that.folders[folderID];
                }
            };

            this.getFolders = function() {
                return that.folders;
            };

            this.getFolderByPath = function(path) {
                //search for folders with Prefix first
                return that.foldersByPath && that.foldersByPath[path];
            };

            this.getFolderById = function(id) {
                return that.folders[id];
            };

            this.showRestartModal = function() {
                //Don't show restart modal, just restart
                //$('#restartNeededModal').modal('show');
                that.restart();
            };
        }]);
})(angular);