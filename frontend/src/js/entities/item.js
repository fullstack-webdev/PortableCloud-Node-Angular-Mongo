(function(window, angular, $) {
    'use strict';
    angular.module('PCloudSyncServer').factory('item', ['$http', '$q', '$translate', 'syncServerConfig', 'chmod', function($http, $q, $translate, syncServerConfig, Chmod) {

        var Item = function(model, path) {
            var rawModel = {
                name: model && model.name || '',
                path: path || [],
                type: model && model.type || 'file',
                size: model && parseInt(model.size || 0),
                syncDevices: '',
                content: model && model.content || '',
                recursive: false,
                sizeKb: Item.prototype.sizeKb,
                fullPath: Item.prototype.fullPath
            };

            if (model && model.date) {
                rawModel.date = parseMySQLDate(model.date);
            }
            if (model && model.rights) {
                rawModel.perms = new Chmod(model && model.rights);
            }

            //for syncgroup
            if (rawModel.type === 'syncgroup') {
                rawModel.id = model._id;
                rawModel.public = model.public;
            }

            this.error = '';
            this.inprocess = false;

            this.model = angular.copy(rawModel);
            this.tempModel = angular.copy(rawModel);

            function parseMySQLDate(mysqlDate) {
                var d = (mysqlDate || '').toString().split(/[- :]/);
                return new Date(d[0], d[1] - 1, d[2], d[3], d[4], d[5]);
            }
        };

        Item.prototype.sizeKb = function() {
            //cache value with item
            this._sizeKb = this._sizeKb || null;
            if (this._sizeKb) return this._sizeKb;
            this._sizeKb = Math.round(this.size / 1024, 1) || 1;
            return this._sizeKb;
        };

        Item.prototype.fullPath = function() {
            this._fullPath = this._fullPath || null;
            if (this._fullPath) return this._fullPath;
            if (this.type === 'syncgroup') {
                this._fullPath = ('/' + this.path.join('/') + '/' + this.id).replace(/\/\//, '/');
            } else {
                this._fullPath = ('/' + this.path.join('/') + '/' + this.name).replace(/\/\//, '/');
            }
            return this._fullPath;
        };

        Item.prototype.update = function() {
            angular.extend(this.model, angular.copy(this.tempModel));
        };

        Item.prototype.revert = function() {
            angular.extend(this.tempModel, angular.copy(this.model));
            this.error = '';
        };

        Item.prototype.deferredHandler = function(data, deferred, defaultMsg) {
            if (!data || typeof data !== 'object') {
                this.error = 'Error. ' + data;
            }
            if (data.result && data.result.error) {
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
            this.update();
            return deferred.resolve(data);
        };

        Item.prototype.createFolder = function() {
            var self = this;
            var deferred = $q.defer();
            var data = {params: {
                mode: 'addfolder',
                path: self.tempModel.path.join('/'),
                name: self.tempModel.name
            }};

            self.inprocess = true;
            self.error = '';
            $http.post(syncServerConfig.createFolderUrl, data).success(function(data) {
                self.deferredHandler(data, deferred);
            }).error(function(data) {
                self.deferredHandler(data, deferred, $translate.instant('error_creating_folder'));
            })['finally'](function() {
                self.inprocess = false;
            });
        
            return deferred.promise;
        };

        Item.prototype.rename = function() {
            var self = this;
            var deferred = $q.defer();
            var data = {params: {
                mode: 'rename',
                path: self.model.fullPath(),
                newPath: self.tempModel.fullPath(),
                name: self.model.name,
                newName: self.tempModel.name
            }};
            if (self.isSyncGroup()); {
                //don't send new path for syncgroups
                delete data.params.newPath;
            }
            //Send name and newName for a syncGroup. On backend, if path is identical and names are different,
            //will assume is a syncGroup being renamed

            self.inprocess = true;
            self.error = '';
            $http.post(syncServerConfig.renameUrl, data).success(function(data) {
                self.deferredHandler(data, deferred);
            }).error(function(data) {
                self.deferredHandler(data, deferred, $translate.instant('error_renaming'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        Item.prototype.copy = function() {
            var self = this;
            var deferred = $q.defer();
            var data = {params: {
                mode: 'copy',
                path: self.model.fullPath(),
                newPath: self.tempModel.fullPath()
            }};

            self.inprocess = true;
            self.error = '';
            $http.post(syncServerConfig.copyUrl, data).success(function(data) {
                self.deferredHandler(data, deferred);
            }).error(function(data) {
                self.deferredHandler(data, deferred, $translate.instant('error_copying'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        Item.prototype.compress = function() {
            var self = this;
            var deferred = $q.defer();
            var data = {params: {
                mode: 'compress',
                path: self.model.fullPath(),
                destination: self.tempModel.fullPath()
            }};

            self.inprocess = true;
            self.error = '';
            $http.post(syncServerConfig.compressUrl, data).success(function(data) {
                self.deferredHandler(data, deferred);
            }).error(function(data) {
                self.deferredHandler(data, deferred, $translate.instant('error_compressing'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        Item.prototype.extract = function() {
            var self = this;
            var deferred = $q.defer();
            var data = {params: {
                mode: 'extract',
                path: self.model.fullPath(),
                sourceFile: self.model.fullPath(),
                destination: self.tempModel.fullPath()
            }};

            self.inprocess = true;
            self.error = '';
            $http.post(syncServerConfig.extractUrl, data).success(function(data) {
                self.deferredHandler(data, deferred);
            }).error(function(data) {
                self.deferredHandler(data, deferred, $translate.instant('error_extracting'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        Item.prototype.getUrl = function(preview) {
            var path = this.model.fullPath();
            var data = {
                mode: 'download',
                preview: preview,
                path: path
            };
            return path && [syncServerConfig.downloadFileUrl, $.param(data)].join('?');
        };

        Item.prototype.download = function(preview) {
            if (this.model.type !== 'dir') {
                window.open(this.getUrl(preview), '_blank', '');
            }
        };

        Item.prototype.getContent = function() {
            var self = this;
            var deferred = $q.defer();
            var data = {params: {
                mode: 'editfile',
                path: self.tempModel.fullPath()
            }};

            self.inprocess = true;
            self.error = '';
            $http.post(syncServerConfig.getContentUrl, data).success(function(data) {
                self.tempModel.content = self.model.content = data.result;
                self.deferredHandler(data, deferred);
            }).error(function(data) {
                self.deferredHandler(data, deferred, $translate.instant('error_getting_content'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        Item.prototype.remove = function() {
            var self = this;
            var deferred = $q.defer();
            var data = {params: {
                mode: 'delete',
                path: self.tempModel.fullPath()
            }};

            self.inprocess = true;
            self.error = '';
            $http.post(syncServerConfig.removeUrl, data).success(function(data) {
                self.deferredHandler(data, deferred);
            }).error(function(data) {
                self.deferredHandler(data, deferred, $translate.instant('error_deleting'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        Item.prototype.edit = function() {
            var self = this;
            var deferred = $q.defer();
            var data = {params: {
                mode: 'savefile',
                content: self.tempModel.content,
                path: self.tempModel.fullPath()
            }};

            self.inprocess = true;
            self.error = '';

            $http.post(syncServerConfig.editUrl, data).success(function(data) {
                self.deferredHandler(data, deferred);
            }).error(function(data) {
                self.deferredHandler(data, deferred, $translate.instant('error_modifying'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        Item.prototype.changePermissions = function() {
            var self = this;
            var deferred = $q.defer();
            var data = {params: {
                mode: 'changepermissions',
                path: self.tempModel.fullPath(),
                perms: self.tempModel.perms.toOctal(),
                permsCode: self.tempModel.perms.toCode(),
                recursive: self.tempModel.recursive
            }};
            
            self.inprocess = true;
            self.error = '';
            $http.post(syncServerConfig.permissionsUrl, data).success(function(data) {
                self.deferredHandler(data, deferred);
            }).error(function(data) {
                self.deferredHandler(data, deferred, $translate.instant('error_changing_perms'));
            })['finally'](function() {
                self.inprocess = false;
            });
            return deferred.promise;
        };

        Item.prototype.isFolder = function() {
            return (this.model.type === 'dir') || (this.model.type === 'syncgroup');
        };


        Item.prototype.isSyncGroup = function() {
            return this.model.type === 'syncgroup';
        };

        Item.prototype.isEditable = function() {
            return !this.isFolder() && syncServerConfig.isEditableFilePattern.test(this.model.name);
        };

        Item.prototype.isImage = function() {
            return syncServerConfig.isImageFilePattern.test(this.model.name);
        };

        Item.prototype.isCompressible = function() {
            return this.isFolder();
        };

        Item.prototype.isExtractable = function() {
            return !this.isFolder() && syncServerConfig.isExtractableFilePattern.test(this.model.name);
        };

        Item.prototype.isOpenableInBrowser = function() {
            return !this.isFolder() && syncServerConfig.isOpenableFilePattern.test(this.model.name);
        };

        Object.defineProperty(Item.prototype, "id", {
            get: function id() {
                return this.model.id;
            }
        });

        return Item;
    }]);
})(window, angular, jQuery);
