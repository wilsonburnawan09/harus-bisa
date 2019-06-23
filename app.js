var express = require('express');
var cors = require('cors');
var app = express();
var db = require('./db');
var Course = require('./model/Course');
var ObjectId = require('mongoose').Types.ObjectId;

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
        socket.valid_rooms = new Set();
        socket.live_lectures = new Set();
        var course = null;
        if (ObjectId.isValid(data.course_id)){
            course = await Course.findById(data.course_id);
        };
        if (course != null){
            course.lectures.forEach(lecture => {
                var nonactive_room = data.course_id + "-" + lecture.id;
                var active_room = data.course_id + "+" + lecture.id;
                socket.valid_rooms.add(nonactive_room);
                socket.join(nonactive_room);
                if ( (socket.user_role === "professor") && (lecture.live === true) ) {
                    socket.join(active_room);
                    socket.live_lectures.add(active_room);
                }
            });
            if (socket.user_role === "student") {
                for(var i=0; i<course.lectures.length; i++){
                    if ( course.lectures[i].live == true) {
                        data = {
                            live: course.lectures[i].live,
                            date: course.lectures[i].date,
                            lecture_id: course.lectures[i].id
                        }
                        socket.emit("lecture_is_live", data);
                        break;
                    }
                } 
            }
        }
    });

    socket.on("get_info", ()=> {
        console.log('The user id is: ', socket.user_id);
        console.log('The user role is: ', socket.user_role);
        console.log('The user is in room: ', Object.keys(socket.rooms));
        console.log('The user valid rooms are: ', socket.valid_rooms);
        console.log('The user live lectures are: ', socket.live_lectures);
        // console.log(socket.id in io.sockets.adapter.rooms);
        // console.log('a' in io.sockets.adapter.rooms);
    })

    socket.on("toggle_lecture_live", (data) => {
        var nonactive_room = data.course_id + "-" + data.lecture_id;
        var active_room = data.course_id + "+" + data.lecture_id;
        if (socket.user_role === "professor" && socket.valid_rooms.has(nonactive_room)) {
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
                    if (live) {
                        course.course_gradebook.forEach((value, user_id) => {
                            if(value.role != "professor"){
                                var lecture_grade = {
                                    present: false,
                                    quiz_answers: {}
                                }
                                course.course_gradebook.get(user_id).lecture_grades[data.lecture_id] = lecture_grade;
                            }
                        });
                    }
                    course.markModified('lectures');
                    course.markModified('course_gradebook');
                    course.save().then( () => {
                        data = {
                            live,
                            date,
                            lecture_id
                        }
                        if (live) {
                            socket.join(active_room, () => { 
                                socket.to(nonactive_room).emit("lecture_is_live", data);
                                socket.live_lectures.add(active_room);
                            });
                        } else if(!live) {
                            socket.leave(active_room, () => {
                                socket.to(nonactive_room).emit("lecture_is_live", data);
                                socket.live_lectures.delete(active_room);
                            });
                        }
                    });
                }
            });
        }
    });

    // TODO leave lecture
    socket.on("participate_lecture", async (data) => {
        if (socket.user_role === "student") {
            var nonactive_room = data.course_id + "-" + data.lecture_id;
            var active_room = data.course_id + "+" + data.lecture_id;
            if (socket.valid_rooms.has(nonactive_room) && (active_room in io.sockets.adapter.rooms)) {
                data = {
                    user_id: socket.user_id,
                    course_id: data.course_id,
                    lecture_id: data.lecture_id
                }
                socket.join(active_room);
                socket.live_lectures.add(active_room);
                socket.to(active_room).emit("new_student_join", data);
                // TODO: save to database
                var course = await Course.findById(data.course_id);
                console.log(course.course_gradebook.get(socket.user_id));
                console.log(course.course_gradebook.get(socket.user_id).lecture_grades);
                
                // console.log(course.course_gradebook.get(socket.user_id).lecture_grades[data.lecture_id].present);


            }
        }
    });

    // student emit(answer)
    socket.on("answer_question", (data) => {
        var active_room = data.course_id + "+" + data.lecture_id;
        if (socket.user_role === "student") {
            console.log(socket.user_id);
            console.log(data.course_id);
            console.log(data.lecture_id);
            console.log(data.question_number);
            console.log(data.answer);
            dat = {
                [data.course_id]: {
                    [socket.user_id]: {
                        [data.lecture_id]: {
                            [data.question_number]: data.answer
                        }
                    }
                }
            }
            socket.to(active_room).emit("new_answer", dat);
        }
    });


    socket.on("start_question", (data) => {
        if (socket.user_role === "professor"){
            var active_room = data.course_id + "+" + data.lecture_id;
            var course_id = data.course_id;
            var lecture_id = data.lecture_id;
            var quiz_index = data.quiz_index;
            var quizzes = null;
            console.log(live_lectures);
            if (socket.live_lectures.has(active_room)) {
                console.log(socket.live_lectures);
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
                        socket.to(active_room).emit("new_question", quiz);
                    }
                });
            }
        }
    });

    socket.on("change_quiz_time", async (data) => {
        var active_room = data.course_id + "+" + data.lecture_id;
        if (socket.user_role == "professor" && socket.live_lectures.has(active_room)) {
            var time = {
                course_id: data.course_id,
                lecture_id: data.lecture_id,
                quiz_index: data.quiz_index,
                time_change: data.time_change,
            }
            var course = await Course.findById(data.course_id);
            if (course.instructor_id == socket.user_id) {
                socket.to(active_room).emit("time_added", time);
                var lecture_index = null;
                for(var i=0; i<course.lectures.length; i++){
                    if ( course.lectures[i].id == data.lecture_id) {
                        lecture_index = i;
                        break;
                    }
                }
                var cur_duration = course.lectures[lecture_index].quizzes[data.quiz_index].time_duration;
                var new_duration;
                if ((cur_duration + data.time_change) < 0) {
                    new_duration = 0;
                } else {
                    new_duration = cur_duration + data.time_change;
                }
                course.lectures[lecture_index].quizzes[data.quiz_index].time_duration = new_duration;
                course.markModified('lectures');
                course.save();            
            } 
        }
    });

    socket.on("close_question", async (data) => {
        var active_room = data.course_id + "+" + data.lecture_id;
        if (socket.user_role == "professor" && socket.live_lectures.has(active_room)) {
            var course = await Course.findById(data.course_id);
            var closed_question = {
                course_id: data.course_id,
                lecture_id: data.lecture_id,
                quiz_index: data.quiz_index,
            }
            if (course.instructor_id == socket.user_id) {
                socket.to(active_room).emit("question_closed", closed_question);
                for(var i=0; i<course.lectures.length; i++){
                    if ( course.lectures[i].id == data.lecture_id) {
                        course.lectures[i].quizzes[data.quiz_index].time_duration = 0;
                        break;
                    }
                }
                // TODO: edit gradebook
                course.markModified('lectures');
                course.save();            
            } 
        }
    });

    socket.on("disconnect", async () => {
        console.log("user ", socket.user_id, " ", socket.user_role, " is disconnected");
        if (socket.user_role === "professor") {
            var connected_lectures = socket.live_lectures.entries();
            for (var room of connected_lectures){
                var cleaned_room = room[0];
                var split_pos = 0;
                for( var i=0; i<cleaned_room.length; i++) {
                    if (cleaned_room.charAt(i) == '+') {
                        split_pos = i;
                        break;
                    }
                }
                var course_id = cleaned_room.slice(0,split_pos);
                var lecture_id = cleaned_room.slice(split_pos+1);
                var live = false;
                var date = null;
                var course = await Course.findById(course_id);
                if (course.instructor_id == socket.user_id) {
                    for(var i=0; i<course.lectures.length; i++){
                        if ( course.lectures[i].id == lecture_id) {
                            date = course.lectures[i].date;
                            break;
                        }
                    }
                    Course.findByIdAndUpdate(course_id, {$set: {"lectures.$[i].live": false}}, {arrayFilters: [{"i.id": Number(lecture_id)}]}, function(err, course) {
                        var data = {
                            live,
                            date,
                            lecture_id
                        }
                        socket.to(room[0]).emit("lecture_is_live", data);
                    });
                } 
            }
            
        }
    });
});

module.exports = server;