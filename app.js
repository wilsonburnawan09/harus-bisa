var express = require('express');
var app = express();
var db = require('./db');

var UserController = require('./user/UserController');
app.use('/users', UserController);

var authController = require('./auth/authController');
app.use('/api/', authController);

app.get('/', function (req, res) {
    res.send("Hello")
});
module.exports = app;