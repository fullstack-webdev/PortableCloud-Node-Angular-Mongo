/*
 Authentication module, generates and validates auth tokens for use on server
 */
var express = require('express');
var router = express.Router();

var config = require('../config');
var couch = require('./couchdb');
var _ = require('lodash');

var Application = require('../models/application');

//loads locally installed applications
var getAllApps = function (req, res, next) {
	//check for applications
	var enabledOnly = false;
	//TODO: implement enabledOnly
	if (req.body && req.body.enabled) enabledOnly = true;

	//load applications
	var query = "_design/application/_view/by_app_id"; //?startkey=%22" + username + "%22";
	//startkey=["foo"]&endkey=["foo",{}]

	couch.dget(query).then(function (resData) {
		if (!resData || !resData.data || !resData.data.rows) {
			return  res.status(401).send("No applications found");
		}
		var rows = resData.data.rows;
		//check for data
		if (rows.length < 1) {
			return res.status(401).send("No applications found.");
		}
		rows = _.map(rows, 'value');
		rows = _.each(rows, function(row, key, list) {
			list[key] = _.omit(row, ['_id', '_rev']);
		});
		return res.status(200).send(rows);
	}, function(err) {
		return res.status(401).send("Error fetching App Store applications: " + err);
	});
};


router.get('/', getAllApps);
//TODO:
/*
 router.get('/:app_id', addApplication);
 */

module.exports = router;