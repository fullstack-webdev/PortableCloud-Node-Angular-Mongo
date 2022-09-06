var sync = require('../modules/sync');

//create syncthing folder

console.log('Creating folder Blue');
sync.createFolder({ id: 'Blue' }).then(function (res) {
    console.log('Successfully created folder Blue');
}, function (err) {
    console.log('Error creating folder Blue', err);
});

console.log('Creating folder Red');
sync.createFolder({ id: 'Red' }).then(function (res) {
    console.log('Successfully created folder Red');
}, function (err) {
    console.log('Error creating folder Red', err);
});


console.log('Creating folder Yellow');
sync.createFolder({ id: 'Yellow' }).then(function (res) {
    console.log('Successfully created folder Yellow');
}, function (err) {
    console.log('Error creating folder Yellow', err);
});


console.log('Creating folder Green');
sync.createFolder({ id: 'Green' }).then(function (res) {
    console.log('Successfully created folder Green');
}, function (err) {
    console.log('Error creating folder Green', err);
});


console.log('Creating folder Orange');
sync.createFolder({ id: 'Orange' }).then(function (res) {
    console.log('Successfully created folder Orange');
}, function (err) {
    console.log('Error creating folder Orange', err);
});

/*
Expected Output (tests correct async blocking of syncthing operations:

 Creating folder Blue
 Creating folder Red
 Creating folder Yellow
 Creating folder Green
 Creating folder Orange
 Error creating folder Blue Folder already exists with this ID
 Error creating folder Red Folder already exists with this ID
 Error creating folder Yellow Folder already exists with this ID
 Error creating folder Green Folder already exists with this ID
 Error creating folder Orange Folder already exists with this ID
 */