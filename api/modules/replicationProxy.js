/*
 Backend module to authorize CouchDB replication commands
 */
var request = require('request');


var couch = require('./couchdb');
var config = require('../config');
var couch_url = config.couch_url + '/' + config.couchdb.database;

function proxy(req, res) {
    if (!req.url || !req.method) {
        return new Error('Malformed request');
    }
    var pos = req.url.substr(1).indexOf('/');
    var url = req.url.substr(pos + 1);
    var authToken = req.url.substring(1, pos + 1);

    if (!authToken) return new Error('Authentication error');

    var newUrl = couch_url + url;
    //console.log(req.method, url);
    
    var tokenString = new Buffer(authToken, 'base64').toString('ascii');
    var parts = tokenString.split(',');
    //Must have a valid auth token to authenticate
    if (!parts || parts.length < 2) {
        return new Error('Authentication error: invalid token.');
    }
    var session = parts[0];
    var user = parts[1];
    if (!user || !session) {
        return new Error('Authentication error: invalid token.');
    }
    /*//restrict access to authenticated users
    if (!req.pc_authenticated || !req.pc_user) {
        return res.status(401).send("Authentication error. You must be logged-in to execute this command.");
    }
    */
    var query = "_design/deviceSession/_view/by_session?key=%22" + session + "%22";
    couch.get(query, function (err, resData) {
        if (err) {
            return new Error('Authentication error: Device session not found.');
        }
        var rows = resData.data.rows;
        //check for data
        if (rows.length < 1 || !rows[0] || !rows[0].value) {
            return next(new Error("Authentication error: Device session not found."));
        }
        var record = rows[0].value;
        if (record.authenticated && (record.user === user)) {
            //pipe couch replication requests to couchdb server
            req.pipe(request(newUrl)).pipe(res);
        } else {
            return new Error('Authentication error: invalid credentials, please try re-linking device to your PortableCloud.net account.');
        }
    });
}

module.exports = proxy;