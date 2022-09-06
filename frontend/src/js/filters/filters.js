(function(angular) {
    'use strict';
    var app = angular.module('PCloudSyncServer');

    var decimals = function(val, num) {
        var digits, decs;

        if (val === 0) {
            return 0;
        }

        digits = Math.floor(Math.log(Math.abs(val)) / Math.log(10));
        decs = Math.max(0, num - digits);
        return decs;
    };

    app.filter('strLimit', ['$filter', function($filter) {
        return function(input, limit) {
            if (input.length <= limit) {
                return input;
            }
            return $filter('limitTo')(input, limit) + '...';
        };
    }]);

    app.filter('formatDate', ['$filter', function() {
        return function(input) {
            return input instanceof Date ?
                input.toISOString().substring(0, 19).replace('T', ' ') :
                (input.toLocaleString || input.toString).apply(input);
        };
    }]);

    app.filter('bytes', function() {
        return function(bytes, precision) {
            if (isNaN(parseFloat(bytes)) || !isFinite(bytes)) return '-';
            if (bytes === 0) return '0 kB';
            if (typeof precision === 'undefined') precision = 1;
            var units = ['bytes', 'kB', 'MB', 'GB', 'TB', 'PB'],
                number = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, Math.floor(number))).toFixed(precision) +  ' ' + units[number];
        };
    });
    app.filter('binary', function () {
        return function (input) {
            if (input === undefined) {
                return '0 ';
            }
            if (input > 1024 * 1024 * 1024) {
                input /= 1024 * 1024 * 1024;
                return input.toFixed(decimals(input, 2)) + ' GB';
            }
            if (input > 1024 * 1024) {
                input /= 1024 * 1024;
                return input.toFixed(decimals(input, 2)) + ' MB';
            }
            if (input > 1024) {
                input /= 1024;
                return input.toFixed(decimals(input, 2)) + ' KB';
            }
            return Math.round(input) + ' ';
        };
    });
    app.filter('alwaysNumber', function () {
        return function (input) {
            if (input === undefined) {
                return 0;
            }
            return input;
        };
    });
    app.filter('natural', function () {
        return function (input, valid) {
            return input.toFixed(decimals(input, valid));
        };
    });
    app.filter('duration', function () {
        var SECONDS_IN = {"d": 86400, "h": 3600, "m": 60,  "s": 1};


        return function (input, precision) {
            var result = "";
            if (!precision) {
                precision = "s";
            }
            input = parseInt(input, 10);
            for (var k in SECONDS_IN) {
                var t = (input/SECONDS_IN[k] | 0); // Math.floor

                if (t > 0) {
                    result += " " + t + k;
                }

                if (precision == k) {
                    return result ? result : "<1" + k;
                } else {
                    input %= SECONDS_IN[k];
                }
            }
            return "[Error: incorrect usage, precision must be one of " + Object.keys(SECONDS_IN) + "]";
        };
    });


})(angular);
