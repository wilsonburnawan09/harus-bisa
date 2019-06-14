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
    socket.on("set_socket_data", async (data) => {
        socket.user_id = data.user_id;
        socket.user_role = data.user_role;
        socket.valid_rooms = [];
        var course = await Course.findById(data.course_id);
        course.lectures.forEach(lecture => {
            var room = data.course_id + "-" + lecture.id;
            socket.valid_rooms.push(room);
            if (socket.user_role === "student") {
                socket.join(room);
            }
        });
        if (socket.user_role === "professor") {
            socket.live_lectures = new Set();
        } else if (socket.user_role === "student") {
                for(var i=0; i<course.lectures.length; i++){
                    if ( course.lectures[i].live == true) {
                        data = {
                            live: courase.lectures[i].live,
                            date: course.lectures[i].date,
                            lecture_id: course.lectures[i].id
                        }
                        socket.emit("lecture_is_live", data);
                        break;
                    }
                } 
        }
    });

    socket.on("get_info", ()=> {
        console.log('The user id is: ', socket.user_id);
        console.log('The user role is: ', socket.user_role);
        console.log('The user is in room: ', Object.keys( io.sockets.adapter.sids[socket.id] ));
    })

    socket.on("toggle_lecture_live", (data) => {
        var room = data.course_id + "-" + data.lecture_id;
        if (socket.user_role === "professor" && socket.valid_rooms.includes(room)){
            var live = null;
            var date = null;
            var lecture_id = data.lecture_id;
            Course.findById(data.course_id, function(err, course){
                if (course.instructor_id == socket.user_id) {
                    for(var i=0; i<course.lectures.length; i++){
                        if ( course.lectures[i].id == data.lecture_id) {
                            if (!course.lectures[i].has_lived) {
                                course.lectures[i].has_lived = true;
                            }
                            course.lectures[i].live = !course.lectures[i].live;
                            live = course.lectures[i].live;
                            date = course.lectures[i].date;
                            break;
                        }
                    }

                    course.course_gradebook.forEach((value, user_id) => {
                        if(value.role != "professor"){
                            var lecture_grade = {
                                present: false,
                                quiz_answers: {}
                            }
                            course.course_gradebook.get(user_id).lectures_grade[data.lecture_id] = lecture_grade;
                        }
                    })
                    course.markModified('lectures');
                    course.markModified('course_gradebook');
                    course.save().then( () => {
                        data = {
                            live,
                            date,
                            lecture_id
                        }
                        if (live) {
                            socket.join(room, () => { 
                                socket.to(room).emit("lecture_is_live", data);
                                socket.live_lectures.add(room);
                            });
                        } else if(!live) {
                            socket.leave(room, () => {
                                socket.to(room).emit("lecture_is_live", data);
                                socket.live_lectures.delete(room);
                            });
                        }
                    });
                }
            });

        }
    });

    socket.on("participate_lecture", (data) => {
        var room = data.course_id + "-" + data.lecture_id;
        if (socket.valid_rooms.includes(room)) {
            data = {
                user_id: socket.user_id
            }
            io.in(room).emit("new_student_join", data);
        }
        // TODO: save to database
    });

    socket.on("start_question", (data) => {
        if (socket.user_role === "professor"){
            var room = data.course_id + "-" + data.lecture_id;
            var course_id = data.course_id;
            var lecture_id = data.lecture_id;
            var quiz_index = data.quiz_index;
            var quizzes = null;
            if (Object.keys( io.sockets.adapter.sids[socket.id] ).includes(room)) {
                Course.findById(course_id, function(err, course){
                    if (course.instructor_id == socket.user_id) {
                        for(var i=0; i<course.lectures.length; i++){
                            if ( course.lectures[i].id == lecture_id) {
                                quizzes = course.lectures[i].quizzes;
                                break;
                            }
                        }
                        var quiz = quizzes[quiz_index];
                        quiz.no = quiz_index;
                        socket.to(room).emit("new_question", quiz);
                    }
                });
            }
        }
    });

    socket.on("disconnect", () => {
        console.log("user ", socket.user_id, " ", socket.user_role, " is disconnected");
        if (socket.user_role === "professor") {
            var connected_lectures = socket.live_lectures.entries();
            for (var room of connected_lectures){
                var cleaned_room = room[0];
                var split_pos = 0;
                for( var i=0; i<cleaned_room.length; i++){
                    if (cleaned_room.charAt(i) == '-') {
                        split_pos = i;
                        break;
                    }
                }
                var course_id = cleaned_room.slice(0,split_pos);
                var lecture_id = cleaned_room.slice(split_pos+1);
                var live = false;
                var date = null;
                Course.findById(course_id, function(err, course){
                    if (course.instructor_id == socket.user_id) {
                        for(var i=0; i<course.lectures.length; i++){
                            if ( course.lectures[i].id == lecture_id) {
                                course.lectures[i].live = false;
                                date = course.lectures[i].date;
                                break;
                            }
                        }
                        course.markModified('lectures');
                        course.save().then( () => {
                            data = {
                                live,
                                date,
                                lecture_id
                            }
                            socket.to(room[0]).emit("lecture_is_live", data);
                        });
                    }
                });
            }
            
        }
    });
});

module.exports = server;