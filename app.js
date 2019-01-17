var express = require('express');
var app = express();
var db = require('./db');


app.all('/', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
});

var UserController = require('./controller/user/UserController');
app.use('/users', UserController);

var authController = require('./controller/auth/authController');
app.use('/api/', authController);

// app.get('/', function (req, res) {
//     res.send("Hello")
// });
module.exports = app;