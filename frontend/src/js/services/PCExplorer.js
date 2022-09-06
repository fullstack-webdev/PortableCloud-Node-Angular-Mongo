/*Encapsulates the PCNavigator and PCFolderService services.
 PC Navigator controls navigating within PortableCloud folders ('SyncGroups').
 PCFolderService controls listing and manipulating PortableCloud folders
 */

(function (angular) {
    'use strict';
    angular.module('PCloudSyncServer').service('PCExplorer', ['$q', 'PCFolderService',
        function ($q, PCFolderService) {

            //easily turn-off logging with this function
            this.log = function () {
                console.log(arguments);
            };

            this.refresh = function () {
                var deferred = $q.defer();
                PCFolderService.refresh().then(function (data) {
                    var folders = [];
                    for (var i = 0, l = data.result.length; i < l; i++) {
                        var folder = data.result[i];
                        folder.type = 'syncgroup';
                        folder.path = '/' + folder._id;
                        folders.push(folder);
                    }
                    deferred.resolve(folders);
                }, function (error) {
                    deferred.reject(error);
                });


                return deferred.promise;
            };

            this.createFolder = PCFolderService.createFolder;
            this.removeFolder = PCFolderService.removeFolder;
        }]);
})(angular);
