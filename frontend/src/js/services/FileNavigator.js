(function (angular) {
    'use strict';
    angular.module('PCloudSyncServer').service('FileNavigator', [
        '$http', '$q', '$location', 'syncServerConfig', 'item', 'PCExplorer', function ($http, $q, $location, syncServerConfig, Item, PCExplorer) {

            $http.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

            this.requesting = false;
            this.fileList = [];
            this._currentPath = [];
            this.history = [];
            this.folders = {};
            this.error = '';
            this.builtTreesFor = {};

            Object.defineProperty(this, "currentPath", {
                get: function currentPath() {
                    return this._currentPath;
                },
                set: function currentPath(cp) {
                    this._currentPath = cp = cp.filter(function(i) { return i.length > 0; });
                    this.refresh();
                }
            });

            this.setCurrentPath = function(path) {
                $location.path("/files/" + escape(path.join('/')));
            };

            this.deferredHandler = function (data, deferred, defaultMsg) {
                if (!data || typeof data !== 'object') {
                    this.error = 'Error. ' + data;
                }
                if (!this.error && data.result && data.result.error) {
                    this.error = data.result.error;
                }
                if (!this.error && data.error) {
                    this.error = data.error.message;
                }
                if (!this.error && defaultMsg) {
                    this.error = defaultMsg;
                }
                if (this.error) {
                    return deferred.reject(data);
                }
                return deferred.resolve(data);
            };

            this.list = function () {
                var self = this;
                var deferred = $q.defer();
                var path = self.currentPath.join('/');
                var data = {params: {
                    mode: 'list',
                    onlyFolders: false,
                    path: '/' + path
                }};

                self.requesting = true;
                self.fileList = [];
                self.error = '';

                $http.post(syncServerConfig.listUrl, data).success(function (data) {
                    self.deferredHandler(data, deferred);
                }).error(function (data) {
                    self.deferredHandler(data, deferred, 'Unknown error listing, check the response');
                })['finally'](function () {
                    self.requesting = false;
                });
                return deferred.promise;
            };

            this.onTopLevel = function () {
                return (this.currentPath.length === 0);
            };

            this.refresh = function () {
                //check if on top-level
                var self = this;

                if (this.onTopLevel()) {
                    PCExplorer.refresh().then(function (folders) {
                        self.refreshExternal(folders);
                        self.folders = {};
                        for (var i = 0, l = folders.length; i < l; i++) {
                            var folder = folders[i];
                            self.folders[folder._id] = folder;
                        }
                    });
                } else {
                    var path = self.currentPath.join('/');
                    return self.list().then(function (data) {
                        self.fileList = (data.result || []).map(function (file) {
                            return new Item(file, self.currentPath);
                        });
                        self.buildTree(self.currentPath);
                    });
                }
            };
            //refresh based on an external data source
            this.refreshExternal = function (fileList) {
                var self = this;
                var path = self.currentPath.join('/');
                self.fileList = fileList.map(function (file) {
                    //TODO: Optimize, figure out why this is being called so many times, just part of Angular loop?
                    return new Item(file, []);
                });
                self.buildTree();
            };

            this.clearTree = function(item) {
                //this.history = [];
                this.refresh();
                var path = item.model.fullPath().split('/').filter(function(i) { return i.length > 0; });
                var dir = '';
                //find path in history
                var nodes = this.history[0].nodes;
                for (var i = 0, l = path.length; i < l; i++) {
                    var last = (i === l - 1);
                    dir += path[i];
                    for (var ii = 0, ll = nodes.length; ii < ll; ii++) {
                        var node = nodes[ii];
                        if (dir === node.name) {
                            dir += '/';
                            if (last) {
                                //remove this node
                                nodes.splice(ii,1);
                            }
                            nodes = node.nodes;
                            break;
                        }
                    }
                }
                this.buildTree(path);
            };

            this.buildTree = function (pathArray) {
                var path = '';

                if (pathArray) {
                    path = pathArray.join('/');
                    //check that built paths for parents as well
                    if (pathArray.length > 1) {
                        var parentPath = pathArray.slice(0, pathArray.length - 1);
                        if (!this.builtTreesFor[parentPath.join('/')]) {
                            this.buildTree(parentPath);
                        }
                    }
                    this.builtTreesFor[path] = true;
                }
                function recursive(parent, item, path) {
                    var absName;
                    if (item.isSyncGroup()) {
                        absName = item.model.id;
                    } else {
                        absName = path ? (path + '/' + item.model.name) : item.model.name;
                    }
                    if (parent && parent.name.trim() && path && path.trim().indexOf(parent.name) !== 0) {
                        parent.nodes = [];
                    }
                    if (parent.name !== path) {
                        for (var i in parent.nodes) {
                            recursive(parent.nodes[i], item, path);
                        }
                    } else {
                        for (var e in parent.nodes) {
                            if (parent.nodes[e].name === absName) {
                                return;
                            }
                        }
                        parent && parent.nodes.push({item: item, name: absName, displayName: item.isSyncGroup() ? item.model.name : absName, nodes: []});
                    }
                    if (parent) {
                        parent.nodes = parent.nodes.sort(function (a, b) {
                            return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() === b.name.toLowerCase() ? 0 : 1;
                        });
                    }
                }

                !this.history.length && this.history.push({name: path, nodes: []});
                for (var o in this.fileList) {
                    var item = this.fileList[o];
                    item.isFolder() && recursive(this.history[0], item, path);
                }
            };

            this.folderClick = function (item) {
                if (item && item.isFolder()) {
                    this.setCurrentPath(item.model.fullPath().split('/').splice(1));
                } else {
                    this.setCurrentPath([]);
                }
            };

            this.upDir = function () {
                if (this.currentPath[0]) {
                    this.setCurrentPath(this.currentPath.slice(0, -1));
                }
            };

            this.goTo = function (index) {
                this.setCurrentPath(this.currentPath.slice(0, index + 1));
                this.refresh();
            };

            this.fileNameExists = function (fileName) {
                for (var item in this.fileList) {
                    item = this.fileList[item];
                    if (fileName.trim && item.model.name.trim() === fileName.trim()) {
                        return true;
                    }
                }
            };

            this.listHasFolders = function () {
                for (var key in this.fileList) {
                    var item = this.fileList[key];
                    if (typeof item === 'object') {
                        if (item.isFolder()) return true;
                    }
                }
            };

            this.getFolderNameById = function (id) {
                return this.folders[id] && this.folders[id].name;
            };
        }]);
})(angular);