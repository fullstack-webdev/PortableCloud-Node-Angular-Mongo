(function (window, angular, $) {
    'use strict';
    angular.module('PCloudSyncServer').controller('PCServerModalsController', [
        '$scope', 'PCUserService', 'PCAuthentication', 'PCViewService', 'Notification',
        function ($scope, PCUserService, PCAuthentication, PCViewService, Notification) {

            $scope.temp = {};

            var reset = function() {
                $scope.temp.password = undefined;
                $scope.temp.password2 = undefined;
            };

            $scope.close = function() {
                $scope.$parent.hideModal('pc-register');
                reset();
            };

            $scope.register = function() {
                var requiredInputs = ['username', 'email', 'password'];
                var errors = [];
                var temp = $scope.temp;

                var errorCheck = function() {
                    //check for errors
                    if (errors.length > 0) {
                        var errorMsg = '';
                        for (var i = 0, l = errors.length; i < l; i++) {
                            errorMsg += errors[i] + '\n';
                        }
                        temp.error = errorMsg;
                        return true;
                    }
                    return false;
                };

                //check for required inputs
                for (var i = 0, l = requiredInputs.length; i < l; i++) {
                    if (typeof temp[requiredInputs[i]] === 'undefined') {
                        errors.push("Missing " + requiredInputs[i] + ".");
                    }
                }

                if (errorCheck()) return;

                //check for matching passwords
                if (temp.password !== temp.password2) {
                    errors.push('Passwords do not match!');
                }

                if (errorCheck()) return;
                //check for matching passwords
                if (temp.password.length < 5) {
                    errors.push('Password must contain at least 5 characters');
                }

                if (errorCheck()) return;
                temp.error = undefined;

                PCUserService.register(temp).then(function(data) {
                    Notification.success('Registered successfully!');
                    //auto login after registering
                    console.log(temp);
                    setTimeout(function() {
                        PCAuthentication.login({
                            username: temp.username,
                            password: temp.password
                        }).then(function() {
                            PCViewService.goHome();
                        });
                    }, 1000);
                    $scope.close();
                }, function(error) {
                    temp.error = error;
                    return;
                });
            };
        }
    ]);
})(window, angular, $);