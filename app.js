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

var http = require("http");
var socketIO = require("socket.io");
var server = http.createServer(app);
var io = socketIO(server);

io.on("connection", socket => {
    console.log("New client connected" + socket.id);
    //console.log(socket);
  
    // Returning the initial data of food menu from FoodItems collection
    socket.on("lecture_toggle_live", () => {
        io.sockets.emit("lecture_is_live", 'hey');
        // io.sockets.emit("get_data", docs);
    });

    socket.on("disconnect", () => {
        console.log("user disconnected");
    });
});

var UserController = require('./controller/userController');
app.use('/api/users', UserController);

var authController = require('./controller/auth/authController');
app.use('/api/', authController);

var courseController = require('./controller/courseController');
app.use('/api/courses', courseController);

var lectureController = require('./controller/lectureController');
app.use('/api/courses/:course_id/lectures', lectureController)

module.exports = app;