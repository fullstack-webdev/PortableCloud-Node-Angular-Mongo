(function (angular) {
    angular.module('PCAccount', [])
        .controller('PCAccountController', [
            '$scope', 'Notification', 'PCUserService',
            PCAccountController
        ]);

    function PCAccountController($scope, Notification, PCUserService) {
        $scope.deleteAccount = function() {
            $scope.showModal('pc-confirm-account-delete');
        };
        $scope.confirmDeleteAccount = function() {
            PCUserService.deleteAccount($scope.username).then(function() {
                Notification.danger('Account deleted');
                $scope.close();

            }, function(error) {
                $scope.temp.error = error;
            });
        };
    }
})(angular);