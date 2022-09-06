(function (angular) {
    'use strict';
    angular.module('PCloudSyncServer').service('PCAuthentication', [
        '$http', '$q', 'syncServerConfig', function ($http, $q, syncServerConfig) {

            $http.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

            var auth = function () {

            };

            auth.prototype.isAuth = function() {
                //check if logged in already
                var deferred = $q.defer();

                $http.get(syncServerConfig.apiUrl + '/auth/isAuth').success(function(data) {
                    if (data) {
                        deferred.resolve(data);
                    } else {
                        deferred.reject();
                    }
                }).error(function(error) {
                    deferred.reject(error);
                });

                return deferred.promise;
            };

            auth.prototype.login = function (data) {
                var deferred = $q.defer();

                $http.post(syncServerConfig.apiUrl + '/auth/login', data).success(function (data) {
                    deferred.resolve(data);
                }).error(function (error) {
                    deferred.reject(error);
                });

                return deferred.promise;
            };

            auth.prototype.logout = function() {
                var deferred = $q.defer();
                $http.get(syncServerConfig.apiUrl + '/auth/logout').success(function () {
                    deferred.resolve();
                }).error(function (error) {
                    deferred.reject(error);
                });

                return deferred.promise;
            };

            return new auth();
        }]);
})(angular);