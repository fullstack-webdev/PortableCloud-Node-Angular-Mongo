(function (angular) {
    angular.module('PCloudSyncServer').directive('pcSyncStatus', ['syncServerConfig', 'PCSyncService', function (syncServerConfig, PCSyncService) {
        return {
            restrict: 'A',
            replace: true,
            transclude: true,
            scope: {
                folder: '='
            },
            controller: ['$scope', '$element', '$interval', function ($scope, $element, $interval) {
                $scope.folderStatus = PCSyncService.folderStatus;
                $scope.folderClass = PCSyncService.folderClass;
                $scope.syncPercentage = PCSyncService.syncPercentage;
                $scope.scanPercentage = PCSyncService.scanPercentage;
                $scope.scanProgress = PCSyncService.scanProgress;
            }],
            templateUrl: syncServerConfig.tplPath + '/PCSyncStatus.html'
        };
    }]);
})(angular);
