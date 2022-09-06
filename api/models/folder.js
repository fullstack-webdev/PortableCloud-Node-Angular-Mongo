var model = require('./modelTemplate');
var _ = require('underscore');

function Folder(params) {
    model.apply(this, [params.id]);

    this.data.doctype = 'folder';
    this.data.name = params.name;
    this.data.path = params.path;
    this.data.public = params.public;
    this.data.owner = params.owner;
    this.data.users = params.users || {};
}

Folder.prototype = new model();

Object.defineProperty(Folder.prototype, "scrubbed", {
    get: function scrubbed() {
        return _.omit(this.data, ['_id', 'doctype', 'path']);
    }
});
Object.defineProperty(Folder.prototype, "path", {
    get: function path() {
        return this.data.path;
    },
    set: function path(path) {
        this.data.path = path;
    }
});
Object.defineProperty(Folder.prototype, "name", {
    get: function name() {
        return this.data.name;
    },
    set: function name(name) {
        this.data.name = name;
    }
});
Object.defineProperty(Folder.prototype, "rev", {
    get: function rev() {
        return this.data._rev;
    }
});

Folder.prototype.isAdmin = function(userId) {
    var user = this.data.users[userId];
    if (!user) return false;
    if (user.access && user.access.admin) {
        return true
    } else {
        return false;
    }
}

Folder.prototype.isOwner = function(userId) {
    return this.data.owner === userId;
}

module.exports = Folder;