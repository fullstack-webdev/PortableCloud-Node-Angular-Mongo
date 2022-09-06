# CloudFiles #

### CloudFiles is the codebase that runs on the PortableCloud.net, to complement the Cube device. ###


## Dependencies: ##
* Node.js /npm
* Bower
* CouchDB
  * Install CouchDB
		- brew install couchdb
		- start CouchDB
	- NGINX
		- Install NGINX
		- start nginx
	- Syncthing
		- Install Syncthing
		- brew install syncthing
		- start syncthing
- Download source code to ..../cloudfiles (git clone ...)
- cd cloudfiles
- npm install
- bower install
- cd cloudfiles/api
- npm install (will need to have a registered npm account with access to pcloud_syncEngine)

- Build Front-end Code
    - cd cloudfiles
    - grunt --force
- Create CouchDB database
    - Create a database named portablecloudsyncserver
    - The easiest way to do this is via the web GUI at http://localhost:5984/_utils/
- Run database seed script (must be done from within api directory)
    - cd cloudfiles/api
    - node seed.js
- Run Syncthing
    - delete any Syncthing default directories
- Create an empty directory for file storage, with 777 permissions
- Update cloudfiles/api/config.js
    - "filesystem.rootdir": new directory just created for file storage
    - Update couchdb settings if using a different couchdb url or database name
    - Update "syncthing.url" if syncthing is running on a different port or url
    - Set "syncthing.key" to the Syncthing API Key (You can get this from the Syncthing GUI's advanced settings)
    - Set "syncthing.device" to the Syncthing device ID (You can also find this is in the Syncthing GUI's settings)
- In api/config.js, set the config.filesystem.rootdir var to a path that the your node instance can access.
- Create a private/public key pair for the Sync server.
    - mkdir cloudfiles/api/keys
    - cd cloudfiles/api/keys
    - ssh-keygen (Use name 'pcloudsyncserver', do not set a passphrase)
  All Syncthing directories will be automatically created with this path.
- Run backend
    - node cloudfiles/api/index.js
- Copy nginx location file from cloudfiles/api/extra into nginx site directory (some variant of /etc/nginx/sites-enabled)
    - Make sure that your nginx.conf has a server directory that includes the sites-enabled directory, or include the location directly:
        server {
      		listen	80;
            server_name	127.0.0.1 localhost;
            index index.html index.htm;
          	include /usr/local/etc/nginx/sites-enabled/*;
        }
- Load front-end code in browswer at http://localhost/cloudfiles/index.html


## Front-End Build Watcher ##
*  To Run build watcher on front-end:
    - cd cloudfiles
    - grunt --force watch &


## Troubleshooting ##
*  To reload nginx, run:
    - sudo nginx -s reload
*  To have front-end code load directly a http://localhost/cloudfiles:
    - Comment out the /cloudfiles location in the syncserver_api.conf file
    - Uncomment the / location in nginx.conf
    - Create a symlink from the nginx root html folder to the cloudfiles/frontend/build directory
        - cd {nginx_path}/nginx/html
        - ln -s ..../cloudfiles/frontend/build cloudfiles
        - sudo nginx -s reload