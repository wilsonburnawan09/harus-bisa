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
app.use('/api/courses/:course_id/lectures', lectureController);

var gradebookController = require('./controller/gradebookController');
app.use('/api/gradebook', gradebookController);

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
        var user = await User.findById(data.user_id);
        socket.user_role = user.role;
        socket.user_id = data.user_id;
        socket.course_id = data.course_id;
        socket.nonactive_rooms = new Set();
        socket.active_rooms = new Set();
        if (socket.user_role == "faculty") {
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
        if (socket.user_role === "faculty") {
            console.log('The user gradebook: ', socket.gradebook);
            console.log('Quizzes: ', socket.quizzes);
        }
        console.log("");
    });

    socket.on("force_info", ()=> {
        socket.gradebook = { 
            course_id: '5c732d072b2b6b2dd830a2cb',
            lecture_id: 19,
            in_class: 2,
            attendance: 2,
            students: new Set([ '5c71fac26e1b79404c874c77', '5c71fb046e1b79404c874c78']),
            statistics: { 
                '0': { '0': 2, '1': 0, '2': 0, total_participants: 2 },
                '1': { '0': 0, '1': 0, '2': 0, total_participants: 0 },
                '2': { '0': 1, '1': 1, '2': 0, total_participants: 2 }
            },
            student_answers: { 
                '0': { 
                    '5c71fb046e1b79404c874c78': 0, 
                    '5c71fac26e1b79404c874c77': 0 
                },
                '1': {},
                '2': { 
                    '5c71fac26e1b79404c874c77': 0, 
                    '5c71fb046e1b79404c874c78': 1 
                } 
            } 
        }
        console.log("forced!");
    });

    socket.on("start_lecture", async (data) => {
        var nonactive_room = socket.course_id + "-" + data.lecture_id;
        var active_room = socket.course_id + "+" + data.lecture_id;
        var lecture;
        console.log(data);
        console.log(socket.nonactive_rooms)
        console.log(nonactive_room)
        console.log(socket.nonactive_rooms.has(nonactive_room))
        if (!socket.nonactive_rooms.has(nonactive_room)) {
            socket.nonactive_rooms.add(nonactive_room);
            socket.join(nonactive_room);
            console.log("ishhh");
        }
        
        console.log("hm")
        console.log(socket.user_role);
        console.log(socket.nonactive_rooms.has(nonactive_room))
        console.log(socket.gradebook.lecture_id);
        if (socket.user_role == "faculty" && socket.nonactive_rooms.has(nonactive_room) && socket.gradebook.lecture_id == null) {
            console.log("hey");
            var course = await Course.findById(socket.course_id);
            if (course.instructor_id == socket.user_id) {
                var lecture_index;
                for (var i=0; i<course.lectures.length; i++){
                    if (course.lectures[i].id == data.lecture_id) {
                        lecture_index = i;
                        var live_field_query = "lectures." + lecture_index.toString() + ".live";
                        var attendace_field_query =  "lectures." + lecture_index.toString() + ".attendance";
                        var has_lived_field_query = "lectures." + lecture_index.toString() + ".has_lived";

                        Course.findByIdAndUpdate(socket.course_id, {$set: {[live_field_query]: true, [has_lived_field_query]: true,[attendace_field_query]: 0}}).exec();

                        lecture = course.lectures[i];
                        break;
                    }
                }
                course.course_gradebook.forEach((value, user_id) => {
                    if(value.role != "faculty"){
                        var lecture_grade = {
                            present: false,
                            quiz_answers: {}
                        }
                        course.course_gradebook.get(user_id).lectures_record[data.lecture_id] = lecture_grade;
                        var field_query = "course_gradebook." + user_id + ".lectures_record." + data.lecture_id.toString(); 
                        Course.findByIdAndUpdate(socket.course_id, {$set: {[field_query]: lecture_grade}}).exec();
                    }
                });

                data = {
                    lecture_id: data.lecture_id,
                    live: true,
                    date: lecture.date 
                }
                console.log(data);
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
            console.log("NOOOO");
            socket.emit("lecture_is_live", {lecture_id: data.lecture_id, live: false});
        }
    });

    

    socket.on("current_lecture", async (data) => {

    });

    socket.on("stop_lecture", async (data) => {
        if (socket.gradebook.lecture_id == data.lecture_id) {
            var nonactive_room = socket.course_id + "-" + data.lecture_id;
            var active_room = socket.course_id + "+" + data.lecture_id;
            var date;
            var course = await Course.findById(socket.course_id);
            var lecture_index;
            for (var i=0; i<course.lectures.length; i++){
                if (course.lectures[i].id == data.lecture_id) {
                    lecture_index = i;
                    date = course.lectures[i].date;
                    break;
                }
            }

            var live_field_query = "lectures." + lecture_index.toString() + ".live";
            var attendace_field_query =  "lectures." + lecture_index.toString() + ".attendance";
            Course.findByIdAndUpdate(socket.course_id, {$set: {[live_field_query]: false, [attendace_field_query]: socket.gradebook.attendance}}).exec();
            
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
        } else if (socket.gradebook.lecture_id == null) {
            var nonactive_room = socket.course_id + "-" + data.lecture_id;
            var course = await Course.findById(socket.course_id);
            if (course.instructor_id == socket.user_id) {
                var lecture_index;
                var date;
                for (var i=0; i<course.lectures.length; i++){
                    if (course.lectures[i].id == data.lecture_id) {
                        date = course.lectures[i].date;
                        lecture_index = i;
                        break;
                    }
                }
                var field_query = "lectures." + lecture_index.toString() + ".live"; 
                Course.findByIdAndUpdate(socket.course_id, {$set: {[field_query]: false}}).exec();

                var data = {
                    lecture_id: data.lecture_id,
                    live: false,
                    date: date
                }

                socket.leave(active_room);
                io.to(nonactive_room).emit("lecture_is_live", data);
                socket.active_rooms.delete(active_room);
            }
        }
    });

    socket.on("participate_lecture", async (data) => {
        if (socket.user_role == "student") {
            var nonactive_room = socket.course_id + "-" + data.lecture_id;
            var active_room = socket.course_id + "+" + data.lecture_id;
            if (socket.nonactive_rooms.has(nonactive_room) && (active_room in io.sockets.adapter.rooms)) {
                var course = await Course.findById(socket.course_id);
                if (course.course_gradebook.has(socket.user_id)) {
                    var field_query = "course_gradebook." + socket.user_id + ".lectures_record." + data.lecture_id.toString() + ".present"; 
                    Course.findByIdAndUpdate(socket.course_id, {$set: {[field_query]: true}}).exec();
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
        if (socket.user_role == "faculty") {
            var student_id = data.user_id;
            var socket_id = data.socket_id;
            if (!socket.gradebook.students.has(student_id)) {
                socket.gradebook.students.add(student_id);
                socket.gradebook.attendance += 1;
                socket.gradebook.in_class += 1;
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
        if (socket.user_role == "faculty") {
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
        if (socket.user_role == "faculty" && socket.active_rooms.has(active_room)){
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
                            var field_query = "lectures." + lecture_index.toString() + ".quizzes." +  quiz_index.toString() + ".include"; 
                            Course.findByIdAndUpdate(socket.course_id, {$set: {[field_query]: true}}).exec();
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
                            var field_query = "lectures." + lecture_index.toString() + ".quizzes." +  quiz_index.toString() + ".time_duration"; 
                            Course.findByIdAndUpdate(socket.course_id, {$set: {[field_query]: 0}}).exec();
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
        if (socket.user_role == "faculty" && socket.active_rooms.has(active_room)) {
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
                        
                        socket.quizzes[quiz_index].time_duration = new_dur;
                        io.to(active_room).emit("tick", { time_duration: socket.quizzes[quiz_index]["time_duration"], quiz_id: quiz_id});

                        var field_query = "lectures."+i.toString()+".quizzes."+quiz_index.toString()+".time_duration" 
                        Course.findByIdAndUpdate(socket.course_id, {$set: {[field_query]: new_dur}}).exec();
                        break;
                    }
                }          
            } 
        }
    });

    socket.on("answer_question", (data) => {
        var active_room = socket.course_id + "+" + data.lecture_id;
        if (socket.user_role === "student") {
            var student_answer = {
                user_id: socket.user_id,
                quiz_answer: data.quiz_answer,
                quiz_id: data.quiz_id
            }
            socket.to(active_room).emit("new_answer", student_answer);
        }
    });

    socket.on("record_answer", (data) => {
        if (socket.user_role == "faculty") {
            var student_id = data.user_id;
            var quiz_id = data.quiz_id;
            var quiz_answer = data.quiz_answer;
            var quiz_index;
            for (var i=0; i<socket.quizzes.length; i++) {
                if (socket.quizzes[i].id == data.quiz_id) {
                    quiz_index = i;
                    break;
                }
            }
            if ( socket.quizzes[quiz_index].live == true ) {
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
        if (socket.user_role == "faculty" && socket.active_rooms.has(active_room)) {
            var course = await Course.findById(socket.course_id);
            var quiz_id = data.quiz_id;
            var lecture_id = socket.gradebook.lecture_id;
            var lecture_index;
            if (course.instructor_id == socket.user_id) {
                for(var i=0; i<course.lectures.length; i++){
                    if ( course.lectures[i].id == socket.gradebook.lecture_id) {
                        var quizzes = course.lectures[i].quizzes;
                        lecture_index = i;
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
                var student_answers = socket.gradebook.student_answers[quiz_id];
                var update_queries = {};
                for (var [user_id, answer] of Object.entries(student_answers)){
                    var field_query = "course_gradebook." + user_id + ".lectures_record." + lecture_id.toString() + ".quiz_answers." + quiz_id.toString();
                    update_queries[field_query] = answer;
                }

                var attendace_field_query =  "lectures." + lecture_index.toString() + ".attendance";
                update_queries[attendace_field_query] = socket.gradebook.attendance;

                Course.findByIdAndUpdate(socket.course_id, {$set: update_queries}).exec();
            } 
        }
    });

    socket.on("disconnect", async () => {
        console.log("user ", socket.user_id, " ", socket.user_role, " is disconnected");
        if (socket.active_rooms == undefined) {
            return;
        }
        var connected_lectures = socket.active_rooms.entries();
        for (var [room, room] of connected_lectures){  
            var cleaned_room = room;
            var split_pos = 0;
            for( var i=0; i<cleaned_room.length; i++) {
                if (cleaned_room.charAt(i) == '+') {
                    split_pos = i;
                    break;
                }
            }
            var course_id = cleaned_room.slice(0,split_pos);
            var lecture_id = cleaned_room.slice(split_pos+1);
            if (socket.user_role == "faculty") {
                // io.of('/').in(room).clients( (err, clients) => {
                //     console.log(clients);
                // }); 
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
                    Course.findByIdAndUpdate(course_id, {$set: {"lectures.$[i].live": false, "lectures.$[i].attendance": socket.gradebook.attendance}}, {arrayFilters: [{"i.id": Number(lecture_id)}]}, function(err, course) {
                        var data = {
                            live,
                            date,
                            lecture_id
                        }
                        socket.to(room).emit("lecture_is_live", data);
                    });
                } 
            } else if (socket.user_role == "student") {
                var data = {
                    socket_id: socket.id,
                    user_id: socket.user_id
                }
                socket.to(room).emit("student_leave", data);
            }
        } 
    });
});

module.exports = server;