var express = require('express');
var router = express.Router();
var config = require('../config');
var couch = require('./couchdb');
var fs = require('fs');
var Q = require('q');
var _ = require('underscore');
var Device = require('../models/device');

//register a device with your account, accepts devicename and secret
var registerDevice = function (req, res, next) {
    var name = req.body.devicename;
    var secret = req.body.secret;
    if (!name || !secret) {
        return res.status(400).send("Missing required fields");
    }
    var user = req.pc_user;

    var device = new Device({
        _id: name
    });
    device.fetch().then(function () {
        if (!device.fetched) return res.status(404).send('Device not found');
        if (device.hasAccess(user)) return res.status(403).send('The device ' + name + ' is already registered with your account.');
        //check secret
        if (secret === device.data.secret) {
            //register user with device
            device.addUser(user);
            device.save().then(function () {
                return res.status(200).send();
            }, function (error) {
                return res.status(400).send('Error: ' + error);
            });
        } else {
            return res.status(403).send('Wrong secret');
        }
    }, function (error) {
        return res.status(404).send('Device not found');
    });
}

//register a device with your account, accepts devicename and secret
var removeDevice = function (req, res, next) {
    var deviceId = req.body && req.body.deviceName;
    if (!deviceId) {
        return res.status(400).send("Missing device id");
    }
    var user = req.pc_user;

    var device = new Device({
        _id: deviceId
    });
    //TODO: Remove device from all of user's syncthing folders
    device.fetch().then(function () {
        if (!device.fetched) return res.status(404).send('Device not found');
        if (!device.hasAccess(user)) return res.status(403).send('You don\'t have access to this device.');
        device.removeUser(user);
        device.save().then(function () {
            return res.status(200).send();
        }, function (error) {
            return res.status(400).send('Error: ' + error);
        });
    }, function (error) {
        return res.status(404).send('Device not found');
    });
}

var listDevices = function (req, res, next) {
    var userId = req.pc_user;

    var query = "_design/device/_view/by_user?key=%22" + userId + "%22";
    couch.dget(query).then(function (resData) {
        var rows = resData.data.rows;
        var devices = [];
        for (var i = 0, l = rows.length; i < l; i++) {
            var device = rows[i];
            devices.push(_.omit(device.value, ['path', '_rev', 'secret']));
        }
        return res.status(200).send({
            result: devices
        });
    }, function (error) {
        return res.status(400).send('Error: ' + error);
    });
}

var restrict = function (req, res, next) {
    if (!req.pc_authenticated || !req.pc_username) {
        return res.status(401).send("Authentication error. You must be logged-in to execute this command.");
    }
    next();
}

router.post('/registerDevice', [restrict, registerDevice]);
router.delete('/', [restrict, removeDevice]);
router.get('/listDevices', [restrict, listDevices]);


module.exports = router;