(function (angular) {
    'use strict';
    angular.module('PCloudSyncServer').service('PCFolderService', ['$http', '$filter', '$q', '$rootScope', 'syncServerConfig', 'Notification', 'PCEvents',
        function ($http, $filter, $q, $rootScope, syncServerConfig, Notification, PCEvents) {
            //private/helped definitions
            var prevDate = 0;
            var navigatingAway = false;
            var online = false;
            var restarting = false;
            var that = this;
            var debouncedFuncs = {};
            var folderUrl = syncServerConfig.apiUrl + '/folder';
            var deviceUrl = syncServerConfig.apiUrl + '/device';

            //easily turn-off logging with this function
            this.log = function () {
                console.log(arguments);
            };

            this.refresh = function () {
                var deferred = $q.defer();

                $http.get(folderUrl + '/listFolders').success(function (data) {
                    deferred.resolve(data);
                }).error(function (error) {
                    deferred.reject(error);
                });

                return deferred.promise;
            };

            this.createFolder = function (params) {
                var deferred = $q.defer();

                var data = {
                    name: params.name,
                    public: params.public || false
                };

                $http.post(folderUrl, data).success(function (data) {
                    deferred.resolve(data);
                }).error(function (error) {
                    deferred.reject(error);
                });

                return deferred.promise;
            };


            this.removeFolder = function (params) {
                var deferred = $q.defer();
                var folderId = params.id;
                if (!folderId) {
                    deferred.reject('Folder id not found');
                } else {
                    $http.delete(folderUrl + '/' + folderId).success(function (data) {
                        deferred.resolve(data);
                    }).error(function (error) {
                        deferred.reject(error);
                    });
                }

                return deferred.promise;
            };

            //DEVICE Functions
            this.registerDevice = function (params) {
                var deferred = $q.defer();

                var data = {
                    devicename: params.devicename,
                    secret: params.secret
                };

                $http.post(deviceUrl + '/registerDevice', data).success(function (data) {
                    deferred.resolve(data);
                }).error(function (error) {
                    deferred.reject(error);
                });

                return deferred.promise;
            };

            this.removeDevice = function (device) {
                var deferred = $q.defer();
                var deviceName = device && device.deviceID;

                if (deviceName) {
                    var data = {
                        deviceName: deviceName
                    };

                    $http({
                        url: deviceUrl + '/',
                        method: 'DELETE',
                        data: data,
                        dataType: "json",
                        headers: {
                            "Content-Type": "application/json"
                        }
                    }).success(function () {
                        deferred.resolve();
                    }).error(function (error) {
                        deferred.reject(error);
                    });
                } else {
                    deferred.reject('Missing device id');
                }

                return deferred.promise;
            };
        }]);
})(angular);