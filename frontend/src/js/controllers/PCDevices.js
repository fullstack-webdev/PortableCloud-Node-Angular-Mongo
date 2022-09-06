(function (window, angular, $) {
    'use strict';
    angular.module('PCloudSyncServer').controller('PCDevicesController', [
        '$scope', '$rootScope', '$http', 'syncServerConfig', 'PCSyncService', 'Notification', 'PCEvents', 'PCFolderService',
        function ($scope, $rootScope, $http, syncServerConfig, PCSyncService, Notification, PCEvents, PCFolderService) {

            var refresh = function() {
                $scope.config = syncServerConfig;
                $scope.model = PCSyncService.model;
                $scope.otherDevices = PCSyncService.otherDevices;
                $scope.deviceName = PCSyncService.deviceName;
                $scope.deviceCfg = PCSyncService.deviceCfg;
                $scope.thisDevice = PCSyncService.thisDevice;
                $scope.deviceName = PCSyncService.deviceName;
                $scope.deviceStatus = PCSyncService.deviceStatus;
                $scope.deviceStats = PCSyncService.deviceStats;
                $scope.deviceFolders = PCSyncService.deviceFolders;
                $scope.deviceClass = PCSyncService.deviceClass;
                $scope.deviceAddr = PCSyncService.deviceAddr;
                $scope.connectionsTotal = PCSyncService.connectionsTotal;
                $scope.localStateTotal = PCSyncService.localStateTotal;
                $scope.system = PCSyncService.system;
                $scope.discoveryTotal = PCSyncService.discoveryTotal;
                $scope.discoveryFailed = PCSyncService.discoveryFailed;
                $scope.relaysTotal = PCSyncService.relaysTotal;
                $scope.relaysFailed = PCSyncService.relaysFailed;
                $scope.versionString = PCSyncService.versionString;
                $scope.completion = PCSyncService.completion;
                $scope.connections = PCSyncService.connections;
                $scope.pauseDevice = PCSyncService.pauseDevice;
                $scope.resumeDevice = PCSyncService.resumeDevice;
            };

            var listener = $rootScope.$on(PCEvents.REFRESH_CONNECTIONS, function() {
                    refresh();
                });

            refresh();

            $scope.form = {
                devicename: 'pcloud-'
            };

            $scope.error = '';

            $scope.addDevice = function() {
                $scope.showModal('pc-register-device');
            };

            $scope.removeDevice = function(device) {
                PCFolderService.removeDevice(device).then(function() {
                    Notification.success('Device removed successfully');
                    PCSyncService.refreshConfig().then(refresh);
                    refresh();
                }, function(error) {
                    $scope.error = error;
                });
            };

            $scope.registerDevice = function(form) {
                PCFolderService.registerDevice(form).then(function() {
                    $scope.hideModal('pc-register-device');
                    Notification.success('Device registered successfully');
                    PCSyncService.refreshConfig().then(refresh);
                    refresh();
                }, function(error) {
                    $scope.error = error;
                });
            };

            $scope.$on('$destroy', function() {
                listener(); // remove listener.
            });

            //for debugging
            //$scope.console = console;
        }]);
})(window, angular, jQuery);
