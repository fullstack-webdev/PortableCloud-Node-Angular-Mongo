//Cryptographic functions for PortableCloudSync
var padding = "padding";
var privateEncrypt = function(key, msg) {
    //TODO: Real encryption
    return msg + padding;
}

var publicDecrypt = function(pubkey, msg) {
    //TODO: Real encryption
    return msg.substr(0, msg.length - padding.length);
}

module.exports = {
    privateEncrypt: privateEncrypt,
    publicDecrypt: publicDecrypt
}