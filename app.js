var express = require('express');
var cors = require('cors');
var app = express();
var db = require('./db');

app.use(cors());

app.all('/', function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    next();
});

var UserController = require('./controller/user/userController');
app.use('/api/users', UserController);

var authController = require('./controller/auth/authController');
app.use('/api/', authController);

// var studentCourseController = require('./controller/student/studentCourseController');
// app.use('/api/student/courses', studentCourseController);

// var professorCourseController = require('./controller/professor/professorCourseController');
// app.use('/api/professor/courses', professorCourseController);

var courseController = require('./controller/courseController');
app.use('/api/courses', courseController);

module.exports = app;