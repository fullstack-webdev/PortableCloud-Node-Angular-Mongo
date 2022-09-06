var config = {
    "app": {
        "port": 3002
    },
    "filesystem": {
        "rootdir": "/usr/local/share/cloudfiles",
        "basedir": __dirname
    },
    "couchdb": {
        "host": "localhost",
        "port": 5984,
        "database": "portablecloudsyncserver"
    },
    "couch_url": "http://localhost:5984",
    "cookieName": 'pcloud',
    "cookieMaxAge": 1000 * 60 * 60 * 3, //hours
    "syncthing": {
        'url': 'http://localhost:8384/rest',
        'key': '%API_KEY%',
        'device': '%DEVICE_ID%'
    },
    "device_id": "PortableCloud.net",
    "serverMode": true,
    "pubKeyPath": "/usr/local/share/portablecloud-sync-server/api/keys/pcloudsyncserver.pub"
};

module.exports = config;
