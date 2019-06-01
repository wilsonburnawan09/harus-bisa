var express = require('express');
var cors = require('cors');
var app = express();
var db = require('./db');

app.use(cors());
// app.all('/', function(req, res, next) {
//     res.header("Access-Control-Allow-Origin", "*");
//     res.header("Access-Control-Allow-Headers", "X-Requested-With");
//     next();
// });

var UserController = require('./controller/userController');
app.use('/api/users', UserController);

var authController = require('./controller/auth/authController');
app.use('/api/', authController);

var courseController = require('./controller/courseController');
app.use('/api/courses', courseController);

var lectureController = require('./controller/lectureController');
app.use('/api/courses/:course_id/lectures', lectureController)

var http = require("http");
var server = http.createServer(app);

const io = require("socket.io")(server, {
    handlePreflightRequest: (req, res) => {
        console.log('hello');
        const headers = {
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Origin": req.headers.origin, //or the specific origin you want to give access to,
            "Access-Control-Allow-Credentials": true
        };
        
        res.writeHead(200, headers);
        res.end();
    }
});


io.on("connection", socket => {
    console.log("New client connected" + socket.id);
    socket.on("set_socket_data", (data) => {
        console.log('hey')
        console.log(data);
        socket.user_id = data.user_id;
        socket.user_role = data.user_role;
        socket.lecture_ids = data.lecture_ids;
        console.log(socket.lecture_ids)
        if (socket.user_role === "student") {
            socket.lecture_ids.forEach(lecture => {
                console.log('2haat')
                socket.join(lecture);
                console.log('The user is a ', socket.user_role);
                console.log('The user is in room: ', socket.rooms);
            });
            
        } else {
            console.log('The user is a ', socket.user_role);
            console.log('The user is in room: ', socket.rooms);
        }
        socket.emit("saved_credential", { message: "User info is stored."})
    });

    // socket.on("lecture_live", (role, lecture_id) => {
    //     if (socket.user_role == "professor"){
    //         socket.join(room, () => {

    //             socket.emit("lecture_is_live", true);
    //         });
    //     } else {
    //         socket.emit("lecture_is_live", false);
    //     }
    // });

    // socket.on("lecture_closed", (lecture_id) => {

    // });

    socket.on("disconnect", () => {
        console.log("user ", socket.user_id, " ", socket.role);
    });
});

module.exports = server;