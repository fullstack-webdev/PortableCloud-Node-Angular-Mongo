var express = require('express');
var router = express.Router();
var cors = require('cors');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var domain = require('domain');

var config = require('./config');

//define modules
var appstore = require('./modules/appstore');
var auth = require('./modules/auth');
var checkCookie = require('./modules/checkCookie');
var device = require('./modules/device');
var files = require('./modules/files');
var folder = require('./modules/folder');
var serverAuth = require('./modules/serverAuth');
var user = require('./modules/user');


//load models and services for sync engine
var User = require('./models/user');
var DeviceSession = require('./models/deviceSession');
var couch = require('./modules/couchdb');
var PCDevicesService = require('./services/deviceService');

//load sync engine
var sync = require('./modules/sync');


var app = express();
//check all requests for cookies
app.use(cookieParser());
app.use(checkCookie);
//proxies. Must occur before any body-parsing middleware
var replicationProxy = require('./modules/replicationProxy');

app.use('/replicationProxy', replicationProxy);
app.use('/sync', sync);

//middleware
app.use(cors());
app.use(bodyParser.json());

app.use('/auth', auth);
app.use('/appstore', appstore);
app.use('/device', device);
app.use('/files', files);
app.use('/folder', folder);
app.use('/serverAuth', serverAuth);
app.use('/user', user);

//error-handling
app.use(function (err, req, res, next) {
    console.error(err && err.message, '500 error');
    res.status(500).send(err && err.message || 'Server error');
});

//run in a domain to catch any uncaught exceptions
var d = domain.create();
d.on('error', function (err) {
    // handle the error safely
    console.log(err && err.message);
});

d.run(function () {
    var server = app.listen(config.app.port, function () {
        var port = server.address().port;
        console.log('PortableCloud Sync Server listening at port %s', port);
    });

    //poll for syncthing
    var syncthingPolling = require('./modules/syncthingPolling');
    syncthingPolling.startSyncthingPolling();
});
