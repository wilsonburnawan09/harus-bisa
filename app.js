var express = require('express');
var cors = require('cors');
var app = express();
var db = require('./db');
var Course = require('./model/Course');
var User = require('./model/User');
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
        // data.user_id
        // data.course_id
        var user = await User.findById(data.user_id);
        socket.user_role = user.role;
        socket.user_id = data.user_id;
        socket.course_id = data.course_id;
        socket.nonactive_rooms = new Set();
        socket.active_rooms = new Set();
        if (socket.user_role == "professor") {
            socket.gradebook = {
                course_id: socket.course_id,
                lecture_id: null,
                in_class: 0,
                attendance: 0,
                students: new Set(),
                statistics: {}, // per quiz
                student_answers: {} // per student
            }
            socket.quizzes = [];
        }

        var course_exist = user.courses.some(function (course) {
            return course.equals(socket.course_id);
        });

        if (course_exist) {
            var course = await Course.findById(socket.course_id);
            course.lectures.forEach( (lecture) => {
                var nonactive_room = socket.course_id + "-" + lecture.id;
                socket.nonactive_rooms.add(nonactive_room);
                socket.join(nonactive_room);
                if ( (socket.user_role == "student") && lecture.live) {
                    data = {
                        lecture_id: lecture.id,
                        date: lecture.date,
                        live: lecture.live,
                    }
                    socket.emit("lecture_is_live", data);
                }
            });
        }
    });

    socket.on("get_info", ()=> {
        console.log('The user id is: ', socket.user_id);
        console.log('The user role is: ', socket.user_role);
        console.log('The user is in room: ', Object.keys(socket.rooms));
        console.log('The user inactive rooms are: ', socket.nonactive_rooms);
        console.log('The user active rooms are: ', socket.active_rooms);
        if (socket.user_role === "professor") {
            console.log('The user gradebook: ', socket.gradebook);
            console.log('Quizzes: ', socket.quizzes);
        }
        console.log("");
    });

    socket.on("start_lecture", async (data) => {
        var nonactive_room = socket.course_id + "-" + data.lecture_id;
        var active_room = socket.course_id + "+" + data.lecture_id;
        var lecture;
        if (socket.user_role == "professor" && socket.nonactive_rooms.has(nonactive_room) && socket.gradebook.lecture_id == null) {
            var course = await Course.findById(socket.course_id);
            if (course.instructor_id == socket.user_id) {
                for (var i=0; i<course.lectures.length; i++){
                    if (course.lectures[i].id == data.lecture_id) {
                        course.lectures[i].has_lived = true;
                        course.lectures[i].live = true;
                        course.lectures[i].attendance = 0;
                        lecture = course.lectures[i];
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
                course.markModified("lectures");
                course.markModified("course_gradebook");
                course.save();

                data = {
                    lecture_id: data.lecture_id,
                    live: true,
                    date: lecture.date 
                }
                socket.join(active_room);
                io.to(nonactive_room).emit("lecture_is_live", data);
                socket.active_rooms.add(active_room);

                socket.gradebook["lecture_id"] = data.lecture_id;
                socket.gradebook["students"].clear();
                var quizzes = [];
                lecture.quizzes.forEach( (quiz) => {
                    var basic_quiz = quiz;
                    basic_quiz["live"] = false;
                    basic_quiz["answer_shown"] = false;
                    quizzes.push(basic_quiz);
                    socket.gradebook.statistics[quiz.id] = {
                        total_participants: 0
                    }
                    socket.gradebook.student_answers[quiz.id] = {}
                    for (answer_index in quiz.answers) {
                        socket.gradebook.statistics[quiz.id][answer_index] = 0; 
                    }
                });
                socket.quizzes = quizzes;
            }
        } else {
            socket.emit("lecture_is_live", {live: false});
        }
    });

    socket.on("stop_lecture", async (data) => {
        if (socket.gradebook.lecture_id == data.lecture_id) {
            var nonactive_room = socket.course_id + "-" + data.lecture_id;
            var active_room = socket.course_id + "+" + data.lecture_id;
            var date;
            var course = await Course.findById(socket.course_id);
            for (var i=0; i<course.lectures.length; i++){
                if (course.lectures[i].id == data.lecture_id) {
                    course.lectures[i].live = false;
                    course.lectures[i].attendance = socket.gradebook.attendance;
                    date = course.lectures[i].date;
                    break;
                }
            }
            course.markModified("lectures");
            course.save();
            data = {
                lecture_id: data.lecture_id,
                live: false,
                date: date
            }
            socket.leave(active_room);
            io.to(nonactive_room).emit("lecture_is_live", data);
            socket.active_rooms.delete(active_room);
            
            socket.gradebook = {
                course_id: socket.course_id,
                lecture_id: null,
                in_class: 0,
                attendance: 0,
                students: new Set(),
                statistics: {}, // per quiz
                student_answers: {} // per student
            }
            socket.quizzes = [];
        }
    });

    socket.on("participate_lecture", async (data) => {
        if (socket.user_role == "student") {
            var nonactive_room = socket.course_id + "-" + data.lecture_id;
            var active_room = socket.course_id + "+" + data.lecture_id;
            if (socket.nonactive_rooms.has(nonactive_room) && (active_room in io.sockets.adapter.rooms)) {
                var course = await Course.findById(socket.course_id);
                if (course.course_gradebook.has(socket.user_id)) {
                    course.course_gradebook.get(socket.user_id).lecture_grades[data.lecture_id].present = true;
                    course.markModified('course_gradebook');
                    course.save();

                    socket.join(active_room);
                    socket.active_rooms.add(active_room);
                    data = {
                        socket_id: socket.id,
                        user_id: socket.user_id
                    }
                    socket.to(active_room).emit("new_student_join", data);
                }
            } 
        }
    });

    socket.on("record_attendance", (data) => {
        if (socket.user_role == "professor") {
            var student_id = data.user_id;
            var socket_id = data.socket_id;
            if (!socket.gradebook.students.has(student_id)) {
                socket.gradebook.students.add(student_id);
                socket.gradebook.attendance += 1;
                socket.gradebook.in_class += 1;
                // socket.to(socket_id).emit("lecture_status", {quizzes: []});
                socket.emit("student_in_session", {total_student: socket.gradebook.in_class});
            } 

            var past_quizzes = [];
            for (var i=0; i<socket.quizzes.length; i++) {
                quiz_id = socket.quizzes[i].id;
                if (socket.quizzes[i].include == true) {
                    var edited_quiz = JSON.parse(JSON.stringify(socket.quizzes[i]));
                    
                    if ( student_id in socket.gradebook.student_answers[quiz_id] ) {
                        edited_quiz["student_answer"] = socket.gradebook.student_answers[quiz_id][student_id];
                    } else {
                        edited_quiz["student_answer"] = null;
                    }
                    edited_quiz["correct_answer"] = null;
                    past_quizzes.push(edited_quiz);
                }
            }
            socket.to(socket_id).emit("lecture_status", {quizzes: past_quizzes});
            
        }
    });

    socket.on("leave_lecture", (data) => {
        if (socket.user_role == "student") {
            var active_room = socket.course_id + "+" + data.lecture_id;
            if (socket.active_rooms.has(active_room)) {
                data = {
                    socket_id: socket.id,
                    user_id: socket.user_id
                }
                socket.to(active_room).emit("student_leave", data);
                socket.leave(active_room);
                socket.active_rooms.delete(active_room);
            } 
        }
    });

    socket.on("remove_student", (data) => {
        if (socket.user_role == "professor") {
            var student_id = data.user_id;
            var socket_id = data.socket_id;
            if (socket.gradebook.students.has(student_id)) {
                socket.gradebook.students.delete(student_id);
                socket.gradebook.in_class -= 1;
                socket.emit("student_in_session", {total_student: socket.gradebook.in_class});
            } 
        }
    });

    socket.on("show_current_quiz", (data) => {
        var quiz_id = data.quiz_id;
        var quiz;
        for (var i=0; i<socket.quizzes.length; i++) {
            if (socket.quizzes[i].id == quiz_id) {
                quiz = socket.quizzes[i];
            }
        }
        socket.emit("current_quiz", {quiz: quiz});
    });

    socket.on("start_question", async (data) => {
        var active_room = socket.course_id + "+" + socket.gradebook.lecture_id;
        var quiz_id = data.quiz_id;
        var quiz_index = 0;
        var lecture_index = 0;
        if (socket.user_role == "professor" && socket.active_rooms.has(active_room)){
                var course = await Course.findById(socket.course_id);
                if (course.instructor_id == socket.user_id) {
                    for(var i=0; i<course.lectures.length; i++){
                        if ( course.lectures[i].id == socket.gradebook.lecture_id) {
                            lecture_index = i;
                            for (var j=0; j<socket.quizzes.length; j++) {
                                if (socket.quizzes[j].id == quiz_id) {
                                    quiz_index = j;
                                    break;
                                }
                            }
                            course.lectures[i].quizzes[quiz_index].include = true;
                            course.markModified("lectures");
                            course.save();
                            break;
                        }
                    }
                    socket.quizzes[quiz_index]["time_duration"] = course.lectures[lecture_index].quizzes[quiz_index]
                    .time_duration;
                    socket.quizzes[quiz_index]["live"] = true;
                    socket.quizzes[quiz_index]["answer_shown"] = false;
                    socket.quizzes[quiz_index]["include"] = true;
                    var quiz = JSON.parse(JSON.stringify(socket.quizzes[quiz_index]));
                    quiz["student_answer"] = null;
                    quiz["correct_answer"] = null;

                    var statistic = {
                        total_participants: 0,
                        answers: {}
                    }
                    var raw_stat = socket.gradebook.statistics[quiz_id];
                    var total = raw_stat["total_participants"];
                    statistic["total_participants"] = total;
                    for ([answer, count] of Object.entries(socket.gradebook.statistics[quiz_id])) {
                        if(answer != "total_participants") {
                            var percent;
                            if (total == 0) {
                                percent = 0;
                            } else {
                                percent = Math.trunc((count/total)*100);
                            }
                            var a_ascii = 65;
                            var answer_letter = String.fromCharCode(parseInt(answer) + a_ascii);
                            statistic["answers"][answer_letter] = percent.toString();
                        }
                    }
                    socket.emit("new_statistic", statistic);
                    socket.to(active_room).emit("new_question", {quiz: quiz});
                    socket.emit("question_is_live", {live: true});
                    
                    async function tick() {
                        io.to(active_room).emit("tick", { time_duration: socket.quizzes[quiz_index]["time_duration"], quiz_id: quiz_id});
                        if (socket.quizzes[quiz_index]["time_duration"] <= 0) {
                            clearInterval(socket.intervalHandle);
                            var quiz = {
                                quiz_id: socket.quizzes[quiz_index].id,
                                live: false,
                            }
                            io.to(active_room).emit("question_is_live", quiz);
                            socket.quizzes[quiz_index]["live"] = false;
                            var course = await Course.findById(socket.course_id);
                            course.lectures[lecture_index].quizzes[quiz_index].time_duration = 0;
                            course.markModified("lectures");
                            course.save();
                            return;
                        }
                        socket.quizzes[quiz_index]["time_duration"] -= 1;
                    }

                    socket.intervalHandle = setInterval(tick, 1000);
                }
            
        }
    });

    socket.on("change_quiz_time", async (data) => {
        var active_room = socket.course_id + "+" + socket.gradebook.lecture_id;
        var quiz_id = data.quiz_id;
        if (socket.user_role == "professor" && socket.active_rooms.has(active_room)) {
            var course = await Course.findById(socket.course_id);
            if (course.instructor_id == socket.user_id) {
                for(var i=0; i<course.lectures.length; i++){
                    if ( course.lectures[i].id == socket.gradebook.lecture_id) {
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

                        // course.lectures[i].quizzes[quiz_index].time_duration = new_dur;
                        
                        socket.quizzes[quiz_index].time_duration = new_dur;
                        socket.to(active_room).emit("tick", { time_duration: socket.quizzes[quiz_index]["time_duration"], quiz_id: quiz_id});

                        var field_query = "lectures."+i.toString()+".quizzes."+quiz_index.toString()+".time_duration" 
                        console.log(field_query);
                        // course.markModified('lectures');
                        Course.findByIdAndUpdate(socket.course_id, {$set: {[field_query]: new_dur}}, {new:true});
                        break;
                    }
                }          
            } 
        }
    });

    socket.on("answer_question", (data) => {
        console.log('answer_question')
        var active_room = socket.course_id + "+" + data.lecture_id;
        if (socket.user_role === "student") {
            var student_answer = {
                user_id: socket.user_id,
                quiz_answer: data.quiz_answer,
            }
            socket.to(active_room).emit("new_answer", student_answer);
            console.log(student_answer)
        }
    });

    socket.on("record_answer", (data) => {
        console.log('hey')
        if (socket.user_role == "professor") {
            console.log(data);
            var student_id = data.user_id;
            var quiz_id = data.quiz_id;
            var quiz_answer = data.quiz_answer;
            var quiz_index;
            for (var i=0; i<socket.quizzes.length; i++) {
                if (socket.quizzes[i].id == data.quiz_id) {
                    console.log('hey')
                    quiz_index = i;
                    break;
                }
            }
            console.log(data.quiz_id);
            console.log('huah')
            console.log(quiz_index);
            console.log(socket.quizzes)
            console.log(socket.quizzes[quiz_index])
            console.log(socket.quizzes[quiz_index].live)
            if ( socket.quizzes[quiz_index].live == true ) {
                console.log('live');
                if ( !(student_id in socket.gradebook.student_answers[quiz_id]) ){
                    socket.gradebook.statistics[quiz_id].total_participants += 1;
                } else {
                    var old_answer = socket.gradebook.student_answers[quiz_id][student_id];
                    socket.gradebook.statistics[quiz_id][old_answer] -= 1
                }
                socket.gradebook.statistics[quiz_id][quiz_answer] += 1;
                socket.gradebook.student_answers[quiz_id][student_id] = quiz_answer;
            
                var statistic = {
                    total_participants: undefined,
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
                        statistic["answers"][answer_letter] = percent.toString();
                    }
                }
                socket.emit("new_statistic", statistic);
                console.log(statistic);
            } 
        }
    });

    socket.on("show_answer", async (data) => {
        var active_room = socket.course_id + "+" + socket.gradebook.lecture_id;
        var course = await Course.findById(socket.course_id);
        var correct_answer;
        if (course.instructor_id == socket.user_id) {
            for (var i=0; i<socket.quizzes.length; i++) {
                if ( socket.quizzes[i].id == data.quiz_id) {
                    correct_answer = socket.quizzes[i].correct_answer;
                    socket.quizzes[i].answer_shown = true;
                    break;
                }
            }
            var quiz_answer = {
                quiz_id: data.quiz_id,
                correct_answer: correct_answer
            }
            socket.to(active_room).emit("answer_opened", quiz_answer);
        }
    });

    socket.on("close_question", async (data) => {
        var active_room = socket.course_id + "+" + socket.gradebook.lecture_id;
        if (socket.user_role == "professor" && socket.active_rooms.has(active_room)) {
            var course = await Course.findById(socket.course_id);
            var quiz_id = data.quiz_id;
            if (course.instructor_id == socket.user_id) {
                for(var i=0; i<course.lectures.length; i++){
                    if ( course.lectures[i].id == socket.gradebook.lecture_id) {
                        var quizzes = course.lectures[i].quizzes;
                        var quiz_index = 0;
                        for (var j=0; j<quizzes.length; j++) {
                            if (quizzes[j].id == quiz_id) {
                                quiz_index = j;
                                break;
                            }
                        }
                        socket.quizzes[quiz_index].time_duration = 0;
                        break;
                    }
                }
                // TODO: edit gradebook     

            } 
        }
    });

    socket.on("disconnect", async () => {
        console.log("user ", socket.user_id, " ", socket.user_role, " is disconnected");
        if (socket.user_role === "professor") {
            var connected_lectures = socket.active_rooms.entries();
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
                var date ;
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