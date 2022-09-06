(function (window, angular, $) {
    'use strict';
    angular.module('PCloudSyncServer').controller('PCFolderSyncSettingsController', [
        '$scope', '$translate', '$http', 'syncServerConfig', 'PCSyncService', 'PCFolderService', 'Notification',
        function ($scope, $translate, $http, syncServerConfig, PCSyncService, PCFolderService, Notification) {
            $scope.config = syncServerConfig;
            $scope.isVisible = function() {
                //TODO: better way to determine whether modal is open, would be great to ditch Bootstrap modals for less reliance on the DOM, to display modals based on model values
                return $('#syncSettings').is(':visible');
            };
            function reset() {
                console.log('reset');
            }
            $scope.init = function() {
                $scope.closed = false;
                $scope.currentFolder = PCSyncService.currentFolder;
                $scope.editingExisting = $scope.currentFolder && (typeof $scope.currentFolder.id !== 'undefined');
                $scope.errorMsg = '';
                $scope.otherDevices = PCSyncService.otherDevices();
            };
            $scope.init();
            $scope.model = PCSyncService.model;
            $scope.deviceName = PCSyncService.deviceName;
            $scope.saveFolder = function() {
                PCSyncService.saveFolder().then(function(data) {
                    Notification.success("Sync settings for <span class='bold'>" + $scope.temp.model.name + "</span> were updated successfully.");
                    $scope.close();
                }, function(error) {
                    $scope.errorMsg = "Error updating sync settings. " + error;
                });
            };
            $scope.close = function() {
                $scope.$parent.hideModal('syncSettings');
            };
            $scope.showAddDevices = false;
            $scope.deviceForm = {
                devicename: 'pcloud-',
                error: ''
            };
            $scope.showAddDevicePanel = function() { $scope.showAddDevices = true; };
            $scope.hideAddDevicePanel = function () { $scope.showAddDevices = false; };
            $scope.registerDevice = function() {
                PCFolderService.registerDevice($scope.deviceForm).then(function() {
                    $scope.hideAddDevicePanel();
                    Notification.success('Device registered successfully');
                    PCSyncService.refreshConfig().then($scope.init);
                    $scope.init();
                }, function(error) {
                    $scope.deviceForm.error = error;
                });
            };


            //for debugging
            //$scope.console = console;
        }]);
})(window, angular, jQuery);
