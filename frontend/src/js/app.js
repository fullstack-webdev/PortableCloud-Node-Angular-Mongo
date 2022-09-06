(function(window, angular, $) {
    'use strict';

    //TODO: disable logging
    //console.log = function() {};

    angular.module('PCloudSyncServer', ['pascalprecht.translate', 'ngCookies', 'PCAccount', 'ui-notification', 'ngMaterial']);

    /**
     * jQuery inits
     */
    $(window.document).on('shown.bs.modal', '.modal', function() {
        window.setTimeout(function() {
            $('[autofocus]', this).focus();
        }.bind(this), 100);
    });

    $(window.document).on('click', function() {
        $('#context-menu').hide();
    });

    $(window.document).on('contextmenu', '.main-navigation .table-files td:first-child, .iconset a.thumbnail', function(e) {
        $('#context-menu').hide().css({
            left: e.pageX,
            top: e.pageY
        }).show();
        e.preventDefault();
    });

})(window, angular, jQuery);
