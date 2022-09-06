var model = require('./modelTemplate');
var _ = require('lodash');

function Application(params) {
    model.apply(this, [params.id]);

	//load all parameters
	this.data = _.extend({}, params);

	//ensure the following parameters are set
    this.data.doctype = 'application';
    this.data.app_id = params.app_id;
    this.data.desc = params.desc;
    this.data.img = params.img;
    this.data.url = params.url;
}

Application.prototype = new model();

module.exports = Application;