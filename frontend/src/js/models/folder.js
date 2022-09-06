(function(angular) {
    var module = angular.module("PCloudSyncServer");

    var Folder = function(params) {
        this.name = params.name;
        this.public = params.public;
    };

    Folder.minLength = 0;

    Folder.prototype = {

        save: function() {

        }

    };

    module.value("Folder", Folder);
}(angular));