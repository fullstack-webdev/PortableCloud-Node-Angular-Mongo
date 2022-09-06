//Service for controlling app views from any controller
(function (angular) {
    'use strict';
    angular.module('PCloudSyncServer').service('PCViewService', [
        '$location', function ($location) {

            var view = function () {

            };

            view.prototype.goto = function (view) {
                $location.path( "#/" + view);
            };

            view.prototype.goHome = function() {
                $location.path( "#/files/");
            };

            return new view();
        }]);
})(angular);