angular.module('PCloudSyncServer').factory('httpInterceptor', ['$q', '$rootScope', function ($q, $rootScope) {
        var AUTH_ERROR = "AuthenticationError401";

        return {
            request: function (config) {
                return config || $q.when(config);
            },
            response: function (response) {
                return response || $q.when(response);
            },
            responseError: function (response) {
                if (response.status === 401) {
                    //broadcast login error
                    $rootScope.$emit(AUTH_ERROR);
                }
                return $q.reject(response);
            }
        };
    }]).config(function ($httpProvider) {
    $httpProvider.interceptors.push('httpInterceptor');
});