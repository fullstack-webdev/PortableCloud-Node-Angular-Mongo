/*
 Authentication module, generates and validates auth tokens for use on server
 */
var express = require('express');
var router = express.Router();
var crypto = require('crypto');

var PCAuthService = require('../services/PCAuthService');
var config = require('../config');
var couch = require('./couchdb');

var login = function (req, res, next) {
    //check for inputs
    if (!req.body || !req.body.username || !req.body.password) {
        return next(new Error('Missing username or password'));
    }
    var username = req.body.username.trim().toLowerCase();
    var password = req.body.password.trim();
    if (!username || !password) {
        return next(new Error('Missing username or password'));
    }
    //check username and password
    var query = "_design/user/_view/by_username?key=%22" + username + "%22";
    couch.dget(query).then(function (resData) {
        if (!resData || !resData.data || !resData.data.rows) {
            return  res.status(401).send("Username not found");
        }
        var rows = resData.data.rows;
        //check for data
        if (rows.length < 1) {
            return next(new Error("Username name not found"));
        }
        var data = rows[0].value;
        //confirm name and public keys match
        var storedPassword = data.password.trim();
        if (storedPassword !== password) {
            return next(new Error("Incorrect password."));
        }
        //if password is correct, store session and send true for login
        var randomNumber = Math.random().toString();
        var session = randomNumber.substring(2, randomNumber.length);

        var admin = data.admin;
        //store session
        //TODO: redis for sessioning
        couch.insert({
            doctype: 'session',
            _id: session,
            user: data._id,
            username: username,
            auth: true,
            admin: admin,
            expiry: Date.now() + config.cookieMaxAge,
            maxAge: config.cookieMaxAge
        });
        //set cookie
        res.cookie(config.cookieName, {
                session: session,
                auth: true,
                admin: admin,
                username: username
            },
            {
                maxAge: config.cookieMaxAge,
                path: '/',
                httpOnly: true
            });
        res.status(200).send({
            username: username,
            admin: admin
        });
    }, function (err) {
        return res.status(401).send("Username not found");
    });
}

//returns user object if authenticated,
// based on data from checkCookie middleware
var isAuth = function (req, res, next) {
    if (req.pc_authenticated) {
        res.status(200).send({
            username: req.pc_username,
            admin: req.pc_admin
        });
    } else {
        res.status(401).send(false);
    }
}

//session management
//check for out-dated sessions every hour
var deleteExpiredRecords = function () {
    var query = "_design/session/_view/by_expiry?endkey=" + Date.now()
    couch.get(query, function (err, resData) {
        if (!resData || !resData.data || !resData.data.rows) {
            return false;
        }
        //console.log('Garbage collecting at :', Date.now());
        var rows = resData.data.rows;
        var toDelete = [];
        for (var i = 0; i < rows.length; i++) {
            var row = rows[i];
            var record = row.value;
            if (record) {
                toDelete.push(record);
                //console.log('deleting ', record);
            }
        }
        couch.deleteAll(toDelete);
        authTimer = setTimeout(deleteExpiredRecords, sessionGarbageCollectionTime);
    });
}

var sessionGarbageCollectionTime = 1000 * 60; //every minute
var authTimer;
deleteExpiredRecords();

router.get('/config', function (req, res, next) {
    res.status(200).send({
        //rootdir: config.filesystem.rootdir
    });
});
router.post('/login', [login]);
router.get('/logout', [PCAuthService.logout]);
router.get('/isAuth', [isAuth]);

module.exports = router;