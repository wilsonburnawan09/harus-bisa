var express = require('express');
var cors = require('cors');
var app = express();
var db = require('./db');
var Course = require('./model/Course');

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
        socket.user_id = data.user_id;
        socket.user_role = data.user_role;
        socket.valid_rooms = [];
        // socket.lecture_ids = data.lecture_ids;
        data.lecture_ids.forEach(lecture => {
            var room = data.course_id + lecture;
            socket.valid_rooms.push(room);
            if (socket.user_role === "student") {
                socket.join(room);
            }
        });
        console.log('The user is a ', socket.user_role);
        console.log('The user is in room: ', Object.keys( io.sockets.adapter.sids[socket.id] ));
    });

    socket.on("toggle_lecture_live", (data) => {
        console.log('hey')
        var room = data.course_id + data.lecture_id;
        if (socket.user_role === "professor" && socket.valid_rooms.includes(room)){
            var live = null;
            Course.findById(data.course_id, function(err, course){
                if (course.instructor_id == data.user_id) {
                    for(var i=0; i<course.lectures.length; i++){
                        if ( course.lectures[i].id == data.lecture_id) {
                            course.lectures[i].live = !course.lectures[i].live;
                            live = course.lectures[i].live
                            break;
                        }
                    }
                    course.markModified('lectures');
                    course.save().then( () => {
                        if (live) {
                            socket.join(room, () => { 
                                socket.to(room).emit("lecture_is_live", true);
                                console.log('The user is in room: ', Object.keys( io.sockets.adapter.sids[socket.id] ));
                            });
                        } else {
                            socket.to(room).emit("lecture_is_live", false);
                            io.in(room).clients(async function(error, clients) {
                                if (clients.length > 0) {
                                    console.log('clients in the room: ');
                                    console.log(clients);
                                    await clients.forEach(function (socket_id) {
                                    io.sockets.sockets[socket_id].leave(room);
                                    });
                                    console.log('The user is in room: ', Object.keys( io.sockets.adapter.sids[socket.id] ));
                                }
                            });
                        }
                    });
                }
            });
        }
    });


    socket.on("disconnect", () => {
        console.log("user ", socket.user_id, " ", socket.user_role);
    });
});

module.exports = server;