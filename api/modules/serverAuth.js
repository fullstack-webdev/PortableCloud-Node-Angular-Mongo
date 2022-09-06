/*
 Authentication module, generates and validates auth tokens for use on server
 Validates device with PortableCloud.org sync server
 */
var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var fs = require('fs');
var _ = require('underscore');

var config = require('../config');
var couch = require('./couchdb');
var cryptography = require('./cryptography');
var Device = require('../models/device');
var DeviceSession = require('../models/deviceSession');
var User = require('../models/user');
var sync = require('./sync');

var deviceCodes = {
    PC: 'PortableCloud'
};

var auth = function (req, res, next) {
    var isAuth = false;
    //TODO: authenticate
    isAuth = true;
    if (isAuth) {
        return next();
    } else {
        res.status(401).send("Error authenticating");
    }
};

//This is called by CubeConfig's configuration script,
//and stores local credentials such as device ID, pubkey, and device name.
//For now, must be manually input into Cloudfiles database
var requestAddingNewDeviceToSystem = function(req, res, next) {
  if (!req || !req.body || !req.body.device_name || !req.body.pub_key || !req.body.device_id) {
    return next(new Error("Missing required request parameters"));
  }
  var filename = req.body.device_name + "-config.txt";
  var fileContents = 'Device Name: ' + req.body.device_name;
  fileContents += '\nDevice ID: ' + req.body.device_id;
  fileContents += '\nPub Key: ' + req.body.pub_key;
  fs.writeFile(config.filesystem.basedir + '/new_device_requests/' + filename, fileContents, function(err) {
    if(err) {
      return console.log(err);
    }

    console.log("The file was saved!");
    res.status(200).send('Device info saved on server successfully');
  });
};

var verifyDevice = function (req, res, next) {
    //error if deviceName or publicKey are missing
    if (!req || !req.body || !req.body.device_name || !req.body.pub_key) {
        return next(new Error("Missing required request parameters"));
    }
    var deviceName = req.body.device_name;
    var publicKey = req.body.pub_key;
    //verify that the device name and public key are loaded in the portablecloud database and match
    var query = "_design/device/_view/by_id?key=%22" + deviceName + "%22";

    couch.get(query, function (err, resData) {
        if (err)
            return next(new Error(err));
        var rows = resData.data.rows;
        //check for data
        if (!rows || rows.length < 1) {
            return next(new Error("This device was not found on PortableCloud.net"));
        }
        var data = rows[0].value;
        //confirm name and public keys match
        if (!data._id || (data._id.trim() !== deviceName.trim())) {
            return next(new Error("Device name does not match server records."));
        }
        if (data.pubkey.trim() !== publicKey.trim()) {
            return next(new Error("Device public key does not match server records."));
        }
        //pass on deviceName and Session id in request
        req.deviceName = deviceName;
        req.publicKey = publicKey;
        return next();
    });
};
var genToken = function (req, res, next) {
    //generate session and token
    var session_id = crypto.randomBytes(64).toString('hex');
    var token = crypto.randomBytes(64).toString('hex');
    //create session object
    var session = {
        _id: session_id,
        token: token
    };
    //write session to disc
    var sess = {
        _id: session_id,
        device_name: req.deviceName,
        challenge: token,
        authenticated: false,
        session: session_id,
        doctype: 'deviceSession'
    };
    if (req.pc_device_auth_user) sess.unauthorized_user = req.pc_device_auth_user;
    if (req.body && req.body.syncthing_id) sess.unauth_syncthing_id = req.body.syncthing_id;

    couch.insert(sess, function (err, resData) {
        //if error abort
        if (err)
            return next(new Error(err));
        //send response
        res.status(200).send({
            token: token,
            session: session_id
        });
    });
};

function linkLogin(req, res, next) {
    //error if username or password are missing
    if (!req || !req.body || !req.body.username || !req.body.password) {
        return next(new Error("Missing username or password"));
    }
    var username = req.body.username;
    var password = req.body.password;

    //check username and password
    var query = "_design/user/_view/by_username?key=%22" + username + "%22";
    couch.get(query, function (err, resData) {
        if (err) {
            return next(new Error("Username not found"));
        }
        if (!resData || !resData.data || !resData.data.rows) {
            return next(new Error("Username not found"));
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
        //set user _id
        req.pc_device_auth_user = data._id;
        return next();
    });
}


function linkRegister(req, res, next) {
    //error if username or password are missing
    if (!req || !req.body || !req.body.username || !req.body.password) {
        return next(new Error("Missing username or password"));
    }
    var username = req.body.username;
    var password = req.body.password;

    //check if username exists
    //TODO: FINISH LINK REGISTER FUNCTION IN DEVICEAUTH
    var query = "_design/user/_view/by_username?key=%22" + username + "%22";
    couch.get(query, function (err, resData) {
        if (err) {
            return next(new Error("Username not found"));
        }
        if (!resData || !resData.data || !resData.data.rows) {
            return next(new Error("Username not found"));
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
        //set user _id
        req.pc_device_auth_user = data._id;
        return next();
    });
}

var verifyToken = function (req, res, next) {
    var session = req.body.session;
    var response = req.body.response;
    var deviceUser = req.body.deviceUser;
    if (!session || !response || !deviceUser) {
        return next(new Error("Missing device session, device User, or response values"));
    }
    //lookup device
    var query = "_design/deviceSession/_view/by_session?key=%22" + session + "%22";
    couch.get(query, function (err, resData) {
        if (err)
            return next(new Error(err));
        var rows = resData.data.rows;
        //check for data
        if (rows.length < 1) {
            return next(new Error("Device session not found on server"));
        }
        var record = rows[0].value;
        //decrypt token with device's public key
        var pubkey = record.publicKey;
        var decrypted = cryptography.publicDecrypt(pubkey, response);
        var challenge = record.challenge;
        if (decrypted === challenge) {
            //update couch record to indicate successful session
            record.authenticated = true;
            record.authTime = Date.now();
            record.device_user = deviceUser;
            record._rev = undefined;

            delete record.challenge;
            //if device verified successfully, add user to device and deviceSession
            var device;
            if (record.unauthorized_user && record.device_name) {
                record.user = record.unauthorized_user;
                var user = record.user;
                device = new Device({
                    _id: record.device_name
                });
                device.fetch().then(function () {
                    if (!device.fetched) return;
                    device.addUser(user);
                    device.save();
                });
                delete record.unauthorized_user;
            }
            //if syncthing record present, add syncthing to device
            if (record.unauth_syncthing_id) {
                if (device) {
                    device.data.syncthingId = record.unauth_syncthing_id;
                    device.save();
                } else if (record.device_name) {
                    device = new Device({
                        _id: record.device_name
                    });
                    device.fetch().then(function () {
                        if (!device.fetched) return;
                        device.data.syncthingId = record.unauth_syncthing_id;
                        device.save();
                    });
                }
                record.syncthingId = record.unauth_syncthing_id;
                delete record.unauth_syncthing_id;
            }

            //if syncthing id check for presence of record in syncthing, add if not found
            if (record.syncthingId) sync.addDevice(record.syncthingId, record.device_name);

            couch.update(record, function (err, resData) {
                if (err) {
                    return next(new Error(err));
                }
                //if authenticated successfully, delete any additional session id's for this device
                var query = "_design/deviceSession/_view/by_device_name?key=%22" + record.device_name + "%22";
                couch.get(query, function (err, resData) {
                    if (err)
                        return next(new Error(err));
                    var rows = resData.data.rows;
                    var toDelete = [];
                    for (var i = 0; i < rows.length; i++) {
                        var row = rows[i];
                        if (!row || !row.value) return new Error('Record not found');
                        var record = row.value;
                        if (record.session !== session) {
                            record._rev = undefined;
                            toDelete.push(record);
                        }
                    }
                    couch.deleteAll(toDelete);
                });
                if (record.user) {
                    var user = new User({ id: record.user });
                    user.fetch().then(function () {
                        if (!user.fetched) return res.status(500).send('Error linking to user account');
                        var syncthingID = config.syncthing.device;
                        res.status(200).send({
                            success: true,
                            session: record.session,
                            user: _.omit(user.data, ['_rev', 'password']),
                            syncthingID: syncthingID
                        });
                    })
                } else {
                    res.status(200).send({
                        success: true,
                        session: record.session
                    });
                }
            });
        } else {
            res.status(401).send('Unsuccessful authentication, incorrect challenge response received.');
        }
    });
}
//deterministic parity function that returns a two-digit base-36 [0-9A-Z] parity code for a name and syncId
var calculateParity = function (name, syncId) {
    var encoded = name + '-' + syncId;
    encoded = encoded.toUpperCase();
    var chunks = encoded.split('-');
    var parity = 378;
    for (var i = 0, l = chunks.length; i < l; i++) {
        var chunk = chunks[i];
        for (var ii = 0, ll = chunk.length; ii < ll; ii++) {
            parity = ii ? (parity + chunk.charCodeAt(ii) * chunk.charCodeAt(ii - 1)) : (parity + chunk.charCodeAt(ii));
        }
    }
    parity = parity % 1296;
    parity = parity.toString(36);
    if (parity.length === 0) parity = "0" + parity;
    parity = parity.toUpperCase();

    return parity;
}

//decoded a PortableCloud device id to obtain encoded syncthing ID and PCloud device name
var decodeDeviceId = function (req, res, next) {
    var encoded = req.body.id;
    var err = undefined;
    var syncId;
    var name;
    if (!encoded) {
        res.status(400).send('Missing required parameters');
        return next();
    }
    encoded = encoded.toUpperCase();
    var chunks = encoded.split('-');
    //should be 8 or 10 chunks
    if ((chunks.length !== 8) && (chunks.length !== 10)) {
        err = "Incorrect device id. Be sure to enter the ID exactly as it is written, including '-' characters."
        res.status(400).send(err);
        return next();
    }
    if (chunks.length === 10) {
        name = chunks[0];
        var parity = chunks[9];
        syncId = chunks.slice(1, 9).join('-');
        //check parity for valid device name with given id. If this fails, just revert to 8 length chunk
        var parityCheck = calculateParity(name, syncId);
        //check for matching two-digit device code at beginning of name
        var devCode = name.substr(0, 2);
        if (deviceCodes[devCode]) {
            name = deviceCodes[devCode] + '-' + name.substr(2);
        }
        if (parityCheck === parity) {
            res.status(200).send({
                id: syncId,
                device_name: name
            });
            return next();
        }
        //if device name not found on key, try processing as an 8 chunk length
        chunks = chunks.slice(1, 9);
    }
    if (chunks.length === 8) {
        syncId = chunks.join('-');
        res.status(200).send({
            id: syncId
        });
        return next();
    }
}

//PortableCloud uses its own device ID's that contain the PCloud name encoded into the device
var encodeDeviceId = function (req, res, next) {
    var name = req.body.name;
    var id = req.body.syncId;

    if (!name || !id) {
        res.status(400).send('Missing required parameters');
        return next();
    }
    var encoded = name + '-' + id;

    var parity = calculateParity(name, id);
    encoded += '-' + parity;
    res.status(200).send({
        encoded: encoded
    });
    return next();
}

var unlinkAccount = function (req, res, next) {
    //load deviceSession
    var session = req.body && req.body.session;
    var user = req.body.user;
    if (!session) return res.status(400).send('Missing session ID');
    if (!user) return res.status(400).send('Missing user');
    var deviceSession = req.pc_device_session;
    //check for matching user id
    if (deviceSession.data.user !== user) return res.status(403).send('You are not the owner of this device session');
    //remove syncthing ID
    if (deviceSession.data.syncthingId) sync.removeDevice(deviceSession.data.syncthingId);
    deviceSession.delete().then(function () {
        return res.status(200).send("Device unlinked successfully");
    }, function (error) {
        return res.status(500).send('Unable to reach PortableCloud.net');
    });
};

var restrict = function (req, res, next) {
    if (!req.body || !req.body.session) {
        return res.status(401).send("Authentication error. You must have a device session to execute this command.");
    }
    //check for device
    var deviceSess = new DeviceSession({ _id: req.body.session });
    deviceSess.fetch().then(function () {
        if (!deviceSess.fetched) return res.status(401).send("Authentication error. Invalid device session.");
        req.pc_device_session = deviceSess;
        return next();
    }, function (error) {
        return res.status(401).send("Authentication error. Invalid device session.");
    });
};

//router.post('/encodeId', [encodeDeviceId]);
//router.post('/decodeId', [decodeDeviceId]);
router.post('/newDeviceRequest', [requestAddingNewDeviceToSystem]);
router.post('/requestToken', [verifyDevice, genToken]);
router.post('/verifyToken', [verifyToken]);
//requests token and checks for device and looks up user by username/password. Both must match to
//register device
router.post('/requestTokenLogin', [linkLogin, verifyDevice, genToken]);
//requests token and checks for device and registers a new user
router.post('/requestTokenRegister', [verifyDevice, linkRegister, genToken]);
//unlink account, must be that registered user
router.post('/unlink', restrict, unlinkAccount);


module.exports = router;