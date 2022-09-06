var config = require('../config');
var couch = require('../modules/couchdb');

var auth = function () {

};

auth.prototype.logout = function (req, res, next) {
    //check for session
    if (!req.pc_session) {
        return res.status(401).send();
    }
    //delete couch record
    couch.delete(req.pc_session);
    //clear cookie
    res.clearCookie(config.cookieName);
    res.status(200).send();
}

module.exports = new auth();

