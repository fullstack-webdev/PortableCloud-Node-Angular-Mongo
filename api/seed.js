var couch = require("./modules/couchdb");
var fs = require("fs");
var nano = require('nano')('http://localhost:5984');
var request = require('request');

var config = require('./config');

var root = './designdocs/'
var designdocs = ['application', 'device', 'deviceSession', 'filters', 'folder', 'session', 'user'];

var db = nano.db.use('portablecloudsyncserver');

console.log('Running seed script');

for (var i = 0, l = designdocs.length; i < l; i++) {
    (function (i) {
        var doc = designdocs[i];
        fs.readFile(root + doc + '.json', 'binary', function (err, data) {
            if (err) {
                console.log(err);
            } else {
                var design_doc = JSON.parse(data);
                db.insert(design_doc, '_design/' + doc, function (err, body, header) {
                    if (err) {
                        console.log(err);
                    }
                    console.log(header);
                    console.log(body);
                    console.log('\n');
                });
            }
        });
    })(i);
}

//PUT admin user default if doesn't exist
var query = "_design/user/_view/by_username?key=%22admin%22";

couch.dexists(query).then(function (resData) {
	console.log(resData);
	if (resData !== true) {
		db.insert({
			"doctype": "user",
			"username": "admin",
			"email": "info@portablecloud.net",
			"password": "pcloudadmin",
			"admin": true,
			"createdOn": Date.now()
		}, function (err, body, header) {
			if (err) {
				console.log(err);
			}
			console.log(header);
			console.log(body);
			console.log('\n');
		});
	}
});