var express = require('express');
var router = express.Router();
var config = require('../config');
var couch = require('./couchdb');
var fs = require('fs');
var Q = require('q');
var PCAuthService = require('../services/PCAuthService');
var _ = require('underscore');

var usernameRegex = new RegExp(/^[a-z0-9]+$/i);
var emailRegex = new RegExp(/[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?/);

var rootDir = config.filesystem.rootdir;

var validEmail = function (email) {
    return emailRegex.test(email);
}

var validUsername = function (username) {
    return usernameRegex.test(username);
}

var createUser = function (req, res, next) {
    //check for inputs
    var requiredInputs = ['username', 'password', 'email'];
    for (var i = 0, l = requiredInputs.length; i < l; i++) {
        if (typeof req.body[requiredInputs[i]] === 'undefined') {
            return next(new Error("Missing " + requiredInputs[i]));
            break;
        }
    }
    var username = req.body.username.trim().toLowerCase();
    var email = req.body.email.trim().toLowerCase();
    var password = req.body.password.trim();

    //check for valid username
    if (username.length > 16) {
        return next(new Error("Username cannot be longer than 16 characters."));
    }
    if (username.length < 3) {
        return next(new Error("Username cannot contain fewer than 3 characters."));
    }
    //check for valid username
    if (!validUsername(username)) {
        return next(new Error("Username is not valid. Username can only contain letters and numbers. Usernames are not case sensitive."));
    }
    //check for valid email address
    if (!validEmail(email)) {
        return next(new Error("Email address is not valid. Please enter a valid email address."));
    }

    //check for unique username
    var query = "_design/user/_view/by_username?key=%22" + username + "%22";
    couch.exists(query, function (err, exists) {
        if (err) {
            return next(new Error("Database error"));
        }
        if (exists) {
            return next(new Error("Username already exists. Please choose a different one."));
        }

        //check for unique email address
        query = "_design/user/_view/by_email?key=%22" + email + "%22";
        couch.exists(query, function (err, exists) {
            if (err) {
                return next(new Error("Database error"));
            }
            if (exists) {
                //TODO: Implement reset password
                return next(new Error('Email address is already in use with a different username.'));
            }

            couch.insert({
                doctype: 'user',
                username: username,
                email: email,
                password: password,
                admin: false,
                createdOn: Date.now()
            }, function (err) {
                if (err) {
                    return next(new Error('Error saving new user.'));
                }
                res.status(200).send();
            });
        });

    });
}

var getUser = function (req, res, next) {

}

var updateUser = function (req, res, next) {

}

var deleteUser = function (req, res, next) {
    var db_deferred = Q.defer();
    var fs_deferred = Q.defer();
    var promises = [db_deferred.promise, fs_deferred.promise];
    var user = req.pc_user;
    var path = config.filesystem.rootdir + '/' + req.pc_username;

    //delete user from couchdb
    couch.delete(user, null, function (error, resData) {
        //var data = resData.data;
        if (error) {
            db_deferred.reject(error);
        } else {
            db_deferred.resolve();
        }
    });


    //TODO: delete folders that only user had access to
    fs_deferred.resolve();

    Q.allSettled(promises).then(function (results) {
        var values = _.compact(_.pluck(results, 'value'));
        if (values && values.length > 0) {
            return res.status(500).send(values);
        } else {
            return next();
        }
    });

    //TODO: Remove User's shared folders from server syncthing instance
}


var restrict = function (req, res, next) {
    var username = req.params.username;

    if (!req.pc_authenticated) {
        return res.status(401).send("Authentication error. You must be logged-in to execute this command.");
    }
    //check for admin or same username authenticated
    if (!req.pc_admin && (req.pc_username.toLowerCase() !== username.toLowerCase())) {
        return res.status(403).send("Authorization error. You can only execute this command as the owner of this account or as an admin.");
    }
    next();
}

router.post('/', [createUser]);
router.get('/:username', [restrict, getUser]);
router.put('/:username', [restrict, updateUser]);
router.delete('/:username', [restrict, deleteUser, PCAuthService.logout]);


module.exports = router;