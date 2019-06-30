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
        if (socket.user_role == "professor") {
            socket.gradebook = {};
        }
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
        if (socket.user_role === "professor") {
            console.log(socket.gradebook);
        }
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
            var lecture = null;
            Course.findById(data.course_id, function(err, course){
                if (course.instructor_id == socket.user_id) {
                    for(var i=0; i<course.lectures.length; i++){
                        if ( course.lectures[i].id == data.lecture_id) {
                            lecture = course.lectures[i];
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
                        socket.gradebook["course_id"] = data.course_id;
                        socket.gradebook["lecture_id"] = data.lecture_id;
                        // many quiz in a lecture
                        socket.gradebook["statistics"] = {};
                        socket.gradebook["student_answers"] = {};
                        lecture.quizzes.forEach( (quiz) => {
                            socket.gradebook.statistics[quiz.id] = {
                                total_participants: 0
                            }
                            socket.gradebook.student_answers[quiz.id] = {}
                        });
                        for(var i=0; i<course.lectures.length; i++){
                            if ( course.lectures[i].id == data.lecture_id) {
                                course.lectures[i].attendance = 0;
                                break;
                            }
                        }

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
                var course = await Course.findById(data.course_id);
                if (course.course_gradebook.has(socket.user_id)) {
                    if (course.course_gradebook.get(socket.user_id).lecture_grades[data.lecture_id].present == false) {
                        course.course_gradebook.get(socket.user_id).lecture_grades[data.lecture_id].present = true;
                        for(var i=0; i<course.lectures.length; i++){
                            if ( course.lectures[i].id == data.lecture_id) {
                                course.lectures[i].attendance += 1;
                                break;
                            }
                        }
                        course.markModified('course_gradebook');
                        course.markModified('lectures');
                        course.save();
                    }
                } else {
                    socket.leave(active_room);
                    socket.live_lectures.delete(active_room);
                }
            }
        }
    });

    socket.on("start_question", (data) => {
        if (socket.user_role === "professor"){
            var active_room = data.course_id + "+" + data.lecture_id;
            var course_id = data.course_id;
            var lecture_id = data.lecture_id;
            var quiz_id = data.quiz_id;
            var quizzes = null;
            if (socket.live_lectures.has(active_room)) {
                Course.findById(course_id, function(err, course){
                    if (course.instructor_id == socket.user_id) {
                        for(var i=0; i<course.lectures.length; i++){
                            if ( course.lectures[i].id == lecture_id) {
                                quizzes = course.lectures[i].quizzes;
                                var quiz_index = 0;
                                for (var j=0; j<quizzes.length; j++) {
                                    if (quizzes[j].id == quiz_id) {
                                        quiz_index = j;
                                        break;
                                    }
                                }
                                course.lectures[i].quizzes[quiz_index].opened = true;
                                course.markModified("lectures");
                                course.save();
                                break;
                            }
                        }
                        
                        // var quiz = quizzes[quiz_index];
                        var quiz = {
                            question: quizzes[quiz_index].question,
                            id: quizzes[quiz_index].id,
                            quiz_index: quiz_index, 
                            live: true,
                            answer_shown: false,
                            time_duration: quizzes[quiz_index].time_duration,
                            answers: quizzes[quiz_index].answers,
                            correct_answer: undefined,
                            student_answer: null
                        }
                        socket.to(active_room).emit("new_question", quiz);
                    }
                });
            }
        }
    });

    socket.on("change_quiz_time", async (data) => {
        var active_room = data.course_id + "+" + data.lecture_id;
        var quiz_id = data.quiz_id;
        if (socket.user_role == "professor" && socket.live_lectures.has(active_room)) {
            var course = await Course.findById(data.course_id);
            if (course.instructor_id == socket.user_id) {
                for(var i=0; i<course.lectures.length; i++){
                    if ( course.lectures[i].id == data.lecture_id) {
                        var quizzes = course.lectures[i].quizzes;
                        var quiz_index = 0;
                        for (var j=0; j<quizzes.length; j++) {
                            if (quizzes[j].id == quiz_id) {
                                quiz_index = j;
                                break;
                            }
                        }

                        var new_dur = data.new_duration;
                        if (data.new_duration < 0) {
                            new_dur = 0;
                        }

                        course.lectures[i].quizzes[quiz_index].time_duration = new_dur;
                        
                        var quiz = {
                            question: quizzes[quiz_index].question,
                            id: quizzes[quiz_index].id,
                            quiz_index: quiz_index, 
                            live: true,
                            answer_shown: false,
                            time_duration: new_dur,
                            answers: quizzes[quiz_index].answers,
                            student_answer: undefined,
                            correct_answer: null,
                        }

                        if (data.new_duration > 0) {
                            socket.to(active_room).emit("time_change", quiz);
                        } else {
                            quiz.live = false;
                            socket.to(active_room).emit("question_closed", quiz);
                        }
                        
                        course.markModified('lectures');
                        course.save();  
                        break;
                    }
                }          
            } 
        }
    });

    socket.on("answer_question", (data) => {
        var active_room = data.course_id + "+" + data.lecture_id;
        if (socket.user_role === "student") {
            var student_answer = {
                user_id: socket.user_id,
                course_id: data.course_id,
                lecture_id: data.lecture_id,
                quiz_id: data.quiz_id,
                quiz_answer: data.quiz_answer,
            }
            socket.to(active_room).emit("new_answer", student_answer);
            console.log(student_answer);
        }
    });

    socket.on("record_answer", (data) => {
        if (socket.user_role === "professor") {
            var user_id = data.user_id;
            var course_id = data.course_id;
            var lecture_id = data.lecture_id;
            var quiz_id = data.quiz_id;
            var quiz_answer = data.quiz_answer;
            if ( (course_id == socket.gradebook.course_id) && (lecture_id == socket.gradebook.lecture_id) ) {
                if ( !(user_id in socket.gradebook.student_answers[quiz_id]) ){
                    socket.gradebook.statistics[quiz_id].total_participants += 1;
                } else {
                    var old_answer = socket.gradebook.student_answers[quiz_id][user_id];
                    socket.gradebook.statistics[quiz_id][old_answer] -= 1
                }
                if (quiz_answer in socket.gradebook.statistics[quiz_id]) {
                    socket.gradebook.statistics[quiz_id][quiz_answer] += 1;
                } else {
                    socket.gradebook.statistics[quiz_id][quiz_answer] = 1;
                }
                socket.gradebook.student_answers[quiz_id][user_id] = quiz_answer;
            }
            var statistic = {
                total_participants: 0,
                answers: {}
            }
            var raw_stat = socket.gradebook.statistics[quiz_id];
            var total = raw_stat["total_participants"];
            statistic["total_participants"] = total;
            for ([answer, count] of Object.entries(raw_stat)) {
                if(answer != "total_participants") {
                    var percent = Math.trunc((count/total)*100);
                    var a_ascii = 65;
                    var answer_letter = String.fromCharCode(parseInt(answer) + a_ascii);
                    statistic["answers"][answer_letter] = percent.toString() + '%';
                }
            }
            socket.emit("new_statistic", statistic);
        }
    });

    socket.on("show_answer", async (data) => {
        var active_room = data.course_id + "+" + data.lecture_id;
        var course_id = data.course_id;
        var lecture_id = data.lecture_id;
        var quiz_id = data.quiz_id;
        var course = await Course.findById(course_id);
        var correct_answer;
        if (course.instructor_id == socket.user_id) {
            for(var i=0; i<course.lectures.length; i++){
                if ( course.lectures[i].id == data.lecture_id) {
                    quizzes = course.lectures[i].quizzes;
                    for (var j=0; j<quizzes.length; j++) {
                        if (quizzes[j].id == quiz_id) {
                            correct_answer = quizzes[j].correct_answer;
                        }
                        break;
                    }
                    break;
                }
            }
        }
        var quiz_answer = {
            course_id,
            lecture_id,
            quiz_id,
            correct_answer
        }
        console.log(quiz_answer);
        socket.to(active_room).emit("answer_opened", quiz_answer);
        console.log(io.sockets.adapter.rooms);
    });

    socket.on("close_question", async (data) => {
        var active_room = data.course_id + "+" + data.lecture_id;
        if (socket.user_role == "professor" && socket.live_lectures.has(active_room)) {
            var course = await Course.findById(data.course_id);
            var quiz_id = data.quiz_id;
            if (course.instructor_id == socket.user_id) {
                for(var i=0; i<course.lectures.length; i++){
                    if ( course.lectures[i].id == data.lecture_id) {
                        var quizzes = course.lectures[i].quizzes;
                        var quiz_index = 0;
                        for (var j=0; j<quizzes.length; j++) {
                            if (quizzes[j].id == quiz_id) {
                                quiz_index = j;
                                break;
                            }
                        }
                        course.lectures[i].quizzes[quiz_index].time_duration = 0;
                        
                        var quiz = {
                            question: quizzes[quiz_index].question,
                            id: quizzes[quiz_index].id,
                            quiz_index: quiz_index, 
                            live: false,
                            answer_shown: false,
                            time_duration: quizzes[quiz_index].time_duration,
                            answers: quizzes[quiz_index].answers,
                            student_answer: undefined,
                            correct_answer: null,
                        }
                        socket.to(active_room).emit("question_closed", quiz);
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