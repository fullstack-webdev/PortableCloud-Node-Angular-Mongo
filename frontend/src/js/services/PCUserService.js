//Service for interacting with backend PortableCloud user module
(function (angular) {
    'use strict';
    angular.module('PCloudSyncServer').service('PCUserService', [
        '$http', '$q', 'syncServerConfig', function ($http, $q, syncServerConfig) {

            $http.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

            var user = function () {

            };

            user.prototype.register = function (data) {
                var deferred = $q.defer();

                $http.post(syncServerConfig.apiUrl + '/user', data).success(function (data) {
                    deferred.resolve(data);
                }).error(function (error) {
                    deferred.reject(error);
                });

                return deferred.promise;
            };

            user.prototype.deleteAccount = function(username) {
                var deferred = $q.defer();

                $http.delete(syncServerConfig.apiUrl + '/user/' + username).success(function (data) {
                    deferred.resolve(data);
                }).error(function (error) {
                    deferred.reject(error);
                });

                return deferred.promise;
            };

            return new user();
        }]);
})(angular);