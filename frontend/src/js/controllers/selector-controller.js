(function(angular, $) {
    'use strict';
    angular.module('PCloudSyncServer').controller('ModalFileManagerCtrl',
        ['$scope', '$rootScope', 'FileNavigator', 'PCExplorer',
        function($scope, $rootScope, FileNavigator, PCExplorer) {

        $scope.reverse = false;
        $scope.predicate = ['model.type', 'model.name'];
        $scope.order = function(predicate) {
            $scope.reverse = ($scope.predicate[1] === predicate) ? !$scope.reverse : false;
            $scope.predicate[1] = predicate;
        };

        $rootScope.select = function(item, temp) {
            temp.tempModel.path = item.model.fullPath().split('/');
            $('#selector').modal('hide');
        };
        
        $rootScope.openNavigator = function(item) {
            FileNavigator.currentPath = item.model.path.slice();
            FileNavigator.refresh();
            $('#selector').modal('show');
        };

    }]);
})(angular, jQuery);