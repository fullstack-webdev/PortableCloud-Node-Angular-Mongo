(function (angular) {
    'use strict';
    angular.module('PCloudSyncServer').provider('syncServerConfig', ['NotificationProvider', function (NotificationProvider) {

        var apiURL = '/syncserver_api';
        var filesURL = apiURL + '/files/';

        var values = {
            appName: 'File Explorer',
            path: {
                images: 'assets/img/'
            },
            defaultLang: 'en',

            apiUrl: apiURL,
            listUrl: filesURL,
            uploadUrl: filesURL,
            renameUrl: filesURL,
            copyUrl: filesURL,
            removeUrl: filesURL,
            editUrl: filesURL,
            getContentUrl: filesURL,
            createFolderUrl: filesURL,
            downloadFileUrl: filesURL,
            compressUrl: filesURL,
            extractUrl: filesURL,
            permissionsUrl: filesURL,
            syncUrl: apiURL + '/sync',

            sidebar: true,
            breadcrumb: true,
            allowedActions: {
                sync: true,
                rename: true,
                copy: true,
                edit: false,
                changePermissions: false,
                compress: false,
                compressChooseName: false,
                extract: false,
                download: true,
                preview: true,
                remove: true
            },

            enablePermissionsRecursive: true,
            compressAsync: true,
            extractAsync: true,

            isEditableFilePattern: /\.(txt|html?|aspx?|ini|pl|py|md|css|js|log|htaccess|htpasswd|json|sql|xml|xslt?|sh|rb|as|bat|cmd|coffee|php[3-6]?|java|c|cbl|go|h|scala|vb)$/i,
            isOpenableFilePattern: /\.(pdf)$/i,
            isImageFilePattern: /\.(jpe?g|gif|bmp|png|svg|tiff?)$/i,
            isExtractableFilePattern: /\.(gz|tar|rar|g?zip)$/i,
            tplPath: 'src/templates',

            notificationDelay: 5000
        };

        NotificationProvider.setOptions({
            delay: values.notificationDelay,
            startTop: 64,
            startRight: 20,
            verticalSpacing: 20,
            horizontalSpacing: 20,
            positionX: 'right',
            positionY: 'top'
        });

        return {
            $get: function () {
                return values;
            },
            set: function (constants) {
                angular.extend(values, constants);
            }
        };

    }]);
})(angular);
