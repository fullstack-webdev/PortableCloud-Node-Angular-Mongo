var couch = require('./couchdb');
var config = require('../config');

module.exports = function (req, res, next) {
    // check if client sent cookie
    var cookie = req.cookies && req.cookies[config.cookieName];
    //console.log(cookie);
    if (!cookie) {
        return next();
    }
    //check for required parameters
    if (!cookie.session) {
        res.clearCookie(config.cookieName);
        return next();
    }

    //check for valid session on cookie
    if (!cookie.auth) {
        return next();
    }

    var query = "_design/session/_view/by_session?key=%22" + cookie.session + "%22";
    couch.get(query, function (err, resData) {
        if (err) {
            return next();
        }
        var rows = resData.data.rows;
        //check for data
        if (rows.length < 1) {
            //if session not found, clear cookie
            res.clearCookie(config.cookieName);
            return next();
        }
        var data = rows[0].value;
        //check for authentication
        if (data.auth) {
            req.pc_authenticated = true;
            if (data.admin) {
                req.pc_admin = true;
            }
            if (data.username) {
                req.pc_username = data.username;
            }
            if (data.user) {
                req.pc_user = data.user;
            }
            if (data._id) {
                req.pc_session = data._id;
            }
            //TODO: only refresh timestamp on user-initiated calls, not auto-refresh calls
            //update time stamp on device if hasn't been updated in a minute
            var now = Date.now();
            //console.log(data.expiry + ' - ' + now + ' = ' + (data.expiry - now) + ' < ' + (config.cookieMaxAge - 60000));
            if (data.expiry - now < (config.cookieMaxAge - 60000)) {
                data.expiry = now + config.cookieMaxAge;
                couch.dupdate(data);
                //console.log(now);
            }
            return next('route');
        } else {
            return next();
        }
    });
};