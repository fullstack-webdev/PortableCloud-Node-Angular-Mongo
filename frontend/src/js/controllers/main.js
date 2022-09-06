(function (window, angular, $) {
    'use strict';
    angular.module('PCloudSyncServer').controller('FileManagerCtrl', [
        '$scope', '$timeout', '$rootScope', '$translate', '$cookies', '$q', '$http', '$location', 'syncServerConfig', 'item', 'FileNavigator', 'fileUploader', 'PCAuthentication', 'PCEvents', 'PCViewService', 'PCSyncService', 'PCExplorer', 'Notification',
        function ($scope, $timeout, $rootScope, $translate, $cookies, $q, $http, $location, syncServerConfig, Item, FileNavigator, FileUploader, PCAuthentication, PCEvents, PCViewService, PCSyncService, PCExplorer, Notification) {

            $scope._displayName = {};
            $scope.config = syncServerConfig;
            $scope.reverse = false;
            $scope.predicate = ['model.type', 'model.name'];
            $scope.order = function (predicate) {
                $scope.reverse = ($scope.predicate[1] === predicate) ? !$scope.reverse : false;
                $scope.predicate[1] = predicate;
            };

            //TODO: Move functions into service so not rebuilt by controller

            $scope.query = '';
            $scope.temp = new Item(); //currently selected item, last set by touch(item)
            $scope.uploadFileList = [];
            $scope.FileNavigator = FileNavigator;
            $scope.viewTemplate = 'main-table.html';
            $scope.viewTemplates = {
                'splash': 'main/splash.html',
                'files': 'main/files.html',
                'devices': 'main/devices.html',
                'sites': 'main/sites.html',
                'account': 'main/account.html'
            };
            $scope.currentModal = '';
            $scope.views = {
                'splash': {},
                'files': {
                    auth: true
                },
                'devices': {
                    auth: true
                },
                'account': {
                    auth: true
                }
            };
            $scope.mainView = 'files';

            $scope.username = undefined;
            $scope.authenticated = false;
            $scope.admin = false;
            $scope.authChecked = false; //set to true after checking for authentication

            $scope.model = PCSyncService.model;
            $scope.sharesFolder = PCSyncService.sharesFolder;

            //expose console for debugging
            $scope.console = console;

            //listen for 401 errors
            $scope._notificationTimeout = {};
            $rootScope.$on(PCEvents.AUTH_ERROR, function (event) {
                if ($scope.authChecked) {
                    if ($scope.mainView !== 'splash' && !$scope._notificationTimeout.loggedOut ||
                        ($scope._notificationTimeout.loggedOut < Date.now())) {
                        Notification.primary({
                            delay: 'never',
                            message: "Logged Out",
                            templateUrl: "src/templates/logged-out-message.html",
                            scope: $scope,
                            replaceMessage: true
                        });
                        $scope._notificationTimeout['loggedOut'] = Date.now() +
                            (syncServerConfig.notificationDelay * 10000);
                    }
                }
            });

            $rootScope.$on('ReloadPage', function (event) {
                location.reload();
            });
            //bootstrap navbar collapse listener
            setTimeout(function () {
                $('.nav a').on('click', function () {
                    !$('.navbar-toggle').hasClass('collapsed') && $('.navbar-toggle').click(); //bootstrap 3.x, navbar collapse on click for mobile views
                });
            }, 300);

            //listen for url changes
            $scope.$on('$locationChangeSuccess', function (event, newUrl, oldUrl) {
                var i = newUrl.lastIndexOf('#');
                var hash;
                if (i !== -1) {
                    hash = newUrl.substring(i + 2);
                }
                if (hash) processView(hash);
            });


            var processView = function (hash) {
                var i = hash.indexOf('/');
                var view;
                var path;
                if (i > -1) {
                    path = hash.substring(i);
                    view = hash.substring(0, i);
                } else {
                    view = hash;
                }
                //check that view is registered
                if (!$scope.views[view]) {
                    $location.path("/splash");
                    return;
                }
                //check for authorization if required
                if (!$scope.authenticated && $scope.views[view].auth && $scope.authChecked) {
                    $location.path("/splash");
                    return;
                }
                //navigate to files if already logged in
                if ($scope.authenticated && (view === 'splash')) {
                    $location.path("/files/");
                    return;
                }
                var oldView = $scope.mainView;
                $scope.mainView = view;
                //clean-up functions
                switch (oldView) {
                }
                //init functions
                switch (view) {
                    case 'files':
                        path = path || '/';
                        path = unescape(unescape(path));
                        path = path || '/';
                        FileNavigator.currentPath = path ? path.split('/') : [];
                        FileNavigator.refresh();
                        break;
                }
            };


            var setLoggedIn = function (data) {
                $scope.authenticated = true;
                $scope.username = data.username;
                //TODO: control admin access for users viewing other's pages or public file pages
                //for now only have private viewing of own files, so admin is always true;
                $scope.admin = true;
                //Notification.warning('Welcome ' + $scope.username + '!');
                //start PCSyncService polling
                PCSyncService.startPolling();
                //navigate to files if already logged in
                if ($scope.authenticated && ($scope.mainView === 'splash')) {
                    $location.path("/files/");
                    return;
                }
            };
            var setLoggedOut = function () {
                $scope.authenticated = false;
                $scope.username = '';
                $scope.admin = false;
                $scope.showView('splash');
                //stop PCSyncService polling when not admin
                PCSyncService.stopPolling();
            };

            //load config data
            var loadConfig = function () {
                var deferred = $q.defer();
                $http.get(syncServerConfig.apiUrl + '/auth/config').success(function (data) {
                    deferred.resolve(data);
                }).error(function (error) {
                    deferred.reject(error);
                });
                return deferred.promise;
            };

            var getCookiesArray = function (cookie) {
                var cookies = [];
                if (cookie !== '') {
                    var split = cookie.split(';');
                    for (var i = 0; i < split.length; i++) {
                        var name_value = split[i].split("=");
                        name_value[0] = name_value[0].replace(/^ /, '');
                        cookies.push({
                            key: decodeURIComponent(name_value[0]),
                            value: decodeURIComponent(name_value[1])
                        });
                    }
                }

                return cookies;
            };

            $scope.init = function () {
                //check if logged in already
                PCAuthentication.isAuth().then(function (data) {
                    setLoggedIn(data);
                    $scope.authChecked = true;
                }, function (error) {
                    setLoggedOut();
                    $scope.authChecked = true;
                });
                //load api config data from api endpoint
                loadConfig().then(function (data) {
                    syncServerConfig.apiConfig = data;
                }, function (error) {
                    //if error try again
                    setTimeout(loadConfig, 1500);
                });
            };

            $scope.showView = function (view) {
                PCViewService.goto(view);
            };


            $scope.logout = function () {
                PCAuthentication.logout().then(function (data) {
                    setLoggedOut();
                }, function (error) {
                    setLoggedOut();
                });
            };
            $scope.login = function (item) {
                item.inprocess = true;
                item.error = '';
                var un = item.username;
                var pw = item.password;

                var data = {
                    username: un,
                    password: pw
                };

                PCAuthentication.login(data).then(function (data) {
                    setLoggedIn(data);
                    $scope.modal('login', 'hide');
                    item.inprocess = false;
                }, function (error) {
                    item.error = "Error logging in. " + error;
                    item.inprocess = false;
                });

            };

            $scope.onTopLevel = function () {
                return FileNavigator.currentPath.length === 0;
            };

            $scope.getFolderByItem = function (item) {
                var folder = PCSyncService.getFolderById(item.model.id);
                return folder;
            };

            $scope.setTemplate = function (name) {
                $scope.viewTemplate = $cookies.viewTemplate = name;
            };

            $scope.changeLanguage = function (locale) {
                if (locale) {
                    return $translate.use($cookies.language = locale);
                }
                $translate.use($cookies.language || syncServerConfig.defaultLang);
            };

            $scope.touch = function (item) {
                item = item instanceof Item ? item : new Item();
                item.revert();
                $scope.temp = item;
            };

            $scope.smartClick = function (item) {
                if (item.isFolder()) {
                    return FileNavigator.folderClick(item);
                }
                // if (item.isImage()) {
                //     return $scope.openImagePreview(item);
                // }
                // if (item.isEditable()) {
                //     return $scope.openEditItem(item);
                // }
                if (item.isImage() || item.isEditable() || item.isOpenableInBrowser()) {
                    return item.download(true);
                } else {
                    return item.download(false);
                }
            };

            $scope.openImagePreview = function (item) {
                item.inprocess = true;
                $scope.modal('imagepreview')
                    .find('#imagepreview-target')
                    .attr('src', item.getUrl(true))
                    .unbind('load error')
                    .on('load error', function () {
                        item.inprocess = false;
                        $scope.$apply();
                    });
                return $scope.touch(item);
            };

            $scope.openEditItem = function (item) {
                item.getContent();
                $scope.modal('edit');
                return $scope.touch(item);
            };

            $scope.modal = function (id, hide) {
                return $('#' + id).modal(hide ? 'hide' : 'show');
            };

            $scope.hideModal = function (id) {
                $scope.modal(id, true);
            };
            //TODO: Move to PCWindowService
            $scope.showModal = function (id) {
                var deferred = $q.defer();
                $scope.currentModal = id;
                //wait for next display cycle with timeout 0
                $timeout(function () {
                    var elem = '#' + id;
                    $(elem).modal('show');
                    //set close listener to remove modal from dom
                    $(elem).on('hidden.bs.modal', function () {
                        $scope.currentModal = '';
                        //if element is not hidden due to an ng-click event but to the bootstrap
                        //modal background, then digest cycle will not apply, so check for digest and apply
                        //if necessary
                        if ($scope.$root.$$phase != '$apply' && $scope.$root.$$phase != '$digest') {
                            $scope.$apply();
                        }
                    });
                    deferred.resolve();
                }, 0);
                return deferred.promise;
            };

            $scope.showSyncSettings = function (item) {
                var folder = $scope.getFolderByItem(item);
                if (folder) {
                    //prepare edit window
                    PCSyncService.editFolder(folder);
                } else {
                    //prepare add window
                    PCSyncService.addFolder();
                }
                $scope.showModal('syncSettings').then(function () {
                    //manually call modal init function
                    //TODO: More elegant way to call modal init function via Angular,
                    //problem is controller from modal open before is not always removed, meaning data is not refreshed
                    setTimeout(function () {
                        angular.element($('#syncSettings')).scope() && angular.element($('#syncSettings')).scope().init();
                    }, 0);
                });
            };

            $scope.isInThisPath = function (path) {
                var currentPath = FileNavigator.currentPath.join('/');
                return currentPath.indexOf(path) !== -1;
            };

            $scope.edit = function (item) {
                item.edit().then(function () {
                    $scope.modal('edit', true);
                });
            };

            $scope.changePermissions = function (item) {
                item.changePermissions().then(function () {
                    $scope.modal('changepermissions', true);
                });
            };

            $scope.copy = function (item) {
                var samePath = item.tempModel.path.join() === item.model.path.join();
                if (samePath && FileNavigator.fileNameExists(item.tempModel.name)) {
                    item.error = $translate.instant('error_invalid_filename');
                    return false;
                }
                item.copy().then(function () {
                    FileNavigator.clearTree(item);
                    FileNavigator.refresh();
                    $scope.modal('copy', true);
                });
            };

            $scope.compress = function (item) {
                item.compress().then(function () {
                    FileNavigator.refresh();
                    if (!$scope.config.compressAsync) {
                        return $scope.modal('compress', true);
                    }
                    item.asyncSuccess = true;
                }, function () {
                    item.asyncSuccess = false;
                });
            };

            $scope.extract = function (item) {
                item.extract().then(function () {
                    FileNavigator.refresh();
                    if (!$scope.config.extractAsync) {
                        return $scope.modal('extract', true);
                    }
                    item.asyncSuccess = true;
                }, function () {
                    item.asyncSuccess = false;
                });
            };

            $scope.remove = function (item) {
                if (item.isSyncGroup()) {
                    PCExplorer.removeFolder({
                        id: item.id
                    }).then(function () {
                        FileNavigator.clearTree(item);
                        FileNavigator.refresh();
                        $scope.modal('delete', true);
                    }, function (error) {
                        item.error = error;
                    });
                } else {
                    item.remove().then(function () {
                        if (item.isFolder()) {
                            FileNavigator.clearTree(item);
                        }
                        FileNavigator.refresh();
                        $scope.modal('delete', true);
                    });
                }
            };

            $scope.rename = function (item) {
                var samePath = item.tempModel.path.join() === item.model.path.join();
                if (samePath && FileNavigator.fileNameExists(item.tempModel.name)) {
                    item.error = $translate.instant('error_invalid_filename');
                    return false;
                }
                item.rename().then(function () {
                    FileNavigator.clearTree(item);
                    FileNavigator.refresh();
                    $scope.modal('rename', true);
                }, function (error) {
                    $scope.temp.error = error;
                });
            };

            $scope.createFolder = function (item) {
                var name = item.tempModel.name && item.tempModel.name.trim();
                item.tempModel.type = 'dir';
                item.tempModel.path = FileNavigator.currentPath;
                //If on top-level create a syncable folder
                if ($scope.onTopLevel()) {
                    PCExplorer.createFolder({ name: name, public: false}).then(function () {
                        FileNavigator.refresh();
                        $scope.modal('newfolder', true);
                    }, function (err) {
                        $scope.temp.error = err;
                    });
                } else if (name && !FileNavigator.fileNameExists(name)) {
                    item.createFolder().then(function () {
                        FileNavigator.refresh();
                        $scope.modal('newfolder', true);
                    }, function (err) {
                        $scope.temp.error = err;
                    });
                } else {
                    item.error = $translate.instant('error_invalid_filename');
                    return false;
                }
            };

            $scope.syncSettings = function (item) {
                $scope.modal('syncSettings');

            };

            $scope.uploadFiles = function () {
                FileUploader.upload($scope.uploadFileList, FileNavigator.currentPath).then(function () {
                    FileNavigator.refresh();
                    $scope.modal('uploadfile', true);
                }, function (data) {
                    var errorMsg = data.result && data.result.error || $translate.instant('error_uploading_files');
                    $scope.temp.error = errorMsg;
                });
            };

            $scope.getQueryParam = function (param) {
                var found;
                window.location.search.substr(1).split('&').forEach(function (item) {
                    if (param === item.split('=')[0]) {
                        found = item.split('=')[1];
                        return false;
                    }
                });
                return found;
            };

            $scope.displayName = function (input) {
                var path;
                if (typeof input === 'object' && !Array.isArray(input)) {
                    path = input.path;
                    path = path && path.filter(function (i) {
                        return i.length > 0;
                    });
                    if (!path || !path[0]) return input.fullPath();
                }
                else path = input;
                if ($scope._displayName && $scope._displayName[path]) {
                    return $scope._displayName[path];
                }
                var s = FileNavigator.getFolderNameById(path[0]) || '/';
                for (var i = 1, l = path.length; i < l; i++) {
                    s += '/' + path[i];
                }
                $scope._displayName[path] = s;
                return s;
            };

            $scope.changeLanguage($scope.getQueryParam('lang'));
            $scope.isWindows = $scope.getQueryParam('server') === 'Windows';
            FileNavigator.refresh();
        }]);


})(window, angular, jQuery);
