var express = require('express');
var router = express.Router({mergeParams: true});
var bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());
var User = require('../model/User');
var Course = require('../model/Course');
var verifyToken = require('./auth/verifyTokenMiddleware');

async function get_class_average(course) { 
    if (course.lectures.length == 0) {
        return '-';
    }
    var lecture_counter = 0;
    var getting_lectures_average = course.lectures.map(lecture_info => {
        if (lecture_info.has_lived) {
            var total_lecture_score = 0;
            lecture_counter += 1;
            var participation_reward = lecture_info.participation_reward_percentage;
            for (var [user_id, course_answers] of course.course_gradebook.entries()){
                if (course_answers.role == "student") {
                    var student_lecture_info = course_answers.lectures_record[lecture_info.id];
                    var total_pts = 0;
                    var accuracy_pts = 0;
                    var participation_pts = 0;
                    var max_accuracy_pts = 0;
                    var max_participation_pts = 0;
                    lecture_info.quizzes.forEach(quiz => {
                        if (quiz.include == true) {
                            max_accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                            max_participation_pts += (participation_reward / 100) * quiz.point;
                            if (student_lecture_info.present && student_lecture_info.quiz_answers[quiz.id] != undefined) {
                                participation_pts += (participation_reward / 100) * quiz.point;
                                if (student_lecture_info.quiz_answers[quiz.id] == quiz.correct_answer) {
                                    accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                                }
                            }
                        }
                    });
                    total_pts = (accuracy_pts+participation_pts) / (max_accuracy_pts+max_participation_pts) * 100;   
                    total_lecture_score +=  isNaN(total_pts) ? 0 : total_pts;
                }
            } 
            return (total_lecture_score/(course.course_gradebook.size-1));
        } else {
            return 0;
        }
    });
    var lectures_total_score = await Promise.all(getting_lectures_average);
    var lectures_average = lecture_counter == 0 ? '-' : (lectures_total_score.reduce((accum,value) => accum + value, 0)/lecture_counter).toFixed(2);
    return lectures_average;
}

router.get('/faculty/courses/:course_id/lectures/:lecture_id/students', verifyToken, async function(req,res,next){
    // if (req.role != "faculty") return res.status(401).send({ message: "Only facultys are allowed to see this data.", data: null});
    if (req.role != "faculty") return res.status(401).send({ message: "Hanya fakultas yang dapat mengakses data ini.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        // if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (err) { return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan kelas.", data: null }); }
        // if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (!course) return res.status(404).send({ message: "Kelas " + req.params.course_id + " tidak ditemukan.", data: null });
        // if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the faculty of this course.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "ID pengguna aplikasi tidak sama dengan ID fakultas dalam kelas.", data: null});
        var lecture_gradebooks = {
            gradebooks: []
        }
        var lecture_info = null
        for (var i=0; i<course.lectures.length; i++){
            if (course.lectures[i].id == req.params.lecture_id) {
                lecture_info = course.lectures[i];
                break;
            }
        }
        // if (lecture_info == null || lecture_info.has_lived == false) return res.status(404).send({ message: "Lecture " + req.params.lecture_id + " not found or never started.", data: null });
        if (lecture_info == null || lecture_info.has_lived == false) return res.status(404).send({ message: "Sesi " + req.params.lecture_id + " tidak ditemukan atau belum pernah dimulai.", data: null });
        var participation_reward = lecture_info.participation_reward_percentage;
        for (var [user_id, course_answers] of course.course_gradebook.entries()){
            var student = await User.findById(user_id);
            if (course_answers.role == "student") {
                var student_lecture_info = course_answers.lectures_record[req.params.lecture_id];
                var total_pts = 0;
                var accuracy_pts = 0;
                var participation_pts = 0;
                var max_accuracy_pts = 0;
                var max_participation_pts = 0;
                var any_included = false;
                lecture_info.quizzes.forEach(quiz => {
                    if (quiz.include == true) {
                        any_included = true;
                        max_accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                        max_participation_pts += (participation_reward / 100) * quiz.point;
                        if (student_lecture_info.present && student_lecture_info.quiz_answers[quiz.id] != undefined) {
                            participation_pts += (participation_reward / 100) * quiz.point;
                            if (student_lecture_info.quiz_answers[quiz.id] == quiz.correct_answer) {
                                accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                            }
                        }
                    }
                });
                total_pts = (accuracy_pts+participation_pts) / (max_accuracy_pts+max_participation_pts) * 100;
                var student_gradebook = {
                    "first_name": student.first_name,
                    "last_name": student.last_name,
                    "email": student.email,
                    "attendance" : student_lecture_info.present,
                    "participation_average_score": any_included ? participation_pts.toFixed(2) : '-',
                    "accuracy_average_score": any_included ? accuracy_pts.toFixed(2) : '-',
                    "total_average_score": any_included ? total_pts.toFixed(2) : '-',
                }
                lecture_gradebooks.gradebooks.push(student_gradebook);
            }
        }
        lecture_gradebooks["gradebooks"].sort((a,b) => (a.first_name > b.first_name) ? 1 : ((b.last_nom > a.last_nom) ? -1 : 0)); 
        // return res.status(200).send({ data: lecture_gradebooks, message: "Get students grade by lecture is successful" });
        // return res.status(200).send({ data: lecture_gradebooks, message: "Nilai murid-murid berdasarkan sesi telah berhasil didapatkan" });
        return res.status(200).send(lecture_gradebooks);
    });
});

router.get('/faculty/courses/:course_id/lectures/:lecture_id/quizzes', verifyToken, async function(req,res,next){
    // if (req.role != "faculty") return res.status(401).send({ message: "Only facultys are allowed to see this data.", data: null});
    if (req.role != "faculty") return res.status(401).send({ message: "Hanya fakultas yang dapat melihat mengakses data ini.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        // if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (err) { return res.status(500).send({ message: "Terjadi masalah mendapatkan kelas.", data: null }); }
        // if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (!course) return res.status(404).send({ message: "Kelas " + req.params.course_id + " tidak ditemukan.", data: null });
        // if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the faculty of this course.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "ID pengguna aplikasi tidak sama dengan ID fakultas dalam kelas.", data: null});
        var lecture_gradebooks = {}
        lecture_gradebooks["number_of_students"] = course.number_of_students;
        lecture_gradebooks["class_average"] = await get_class_average(course)
        lecture_gradebooks["gradebooks"] = []
        var lecture_info = null
        for (var i=0; i<course.lectures.length; i++){
            if (course.lectures[i].id == req.params.lecture_id) {
                lecture_info = course.lectures[i];
                break;
            }
        }
        // if (lecture_info == null || lecture_info.has_lived == false) return res.status(404).send({ message: "Lecture " + req.params.lecture_id + " not found or never started.", data: null });
        if (lecture_info == null || lecture_info.has_lived == false) return res.status(404).send({ message: "Sesi " + req.params.lecture_id + " tidak ditemukan atau belum pernah dimulai.", data: null });
        var participation_reward = lecture_info.participation_reward_percentage;
        var quiz_number = 1;
        lecture_info.quizzes.forEach(quiz => {
            var total_participants = 0;
            var average_score = 0;
            var accuracy_pts = 0;
            var participation_pts = 0;
            var max_accuracy_pts = 0;
            for (var [user_id, course_answers] of course.course_gradebook.entries()){
                if (course_answers.role != "faculty") {
                    if (course_answers.lectures_record[req.params.lecture_id].present && course_answers.lectures_record[req.params.lecture_id].quiz_answers[quiz.id] != undefined) {
                        if (course_answers.lectures_record[req.params.lecture_id].quiz_answers[quiz.id] == quiz.correct_answer) {
                            accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                        }
                        total_participants += 1;
                        participation_pts += (participation_reward/100) * quiz.point;
                        max_accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                    }
                }
            }
            average_score = ((accuracy_pts+participation_pts)/(max_accuracy_pts+participation_pts))*100
            average_score = isNaN(average_score) ? '0.00' : average_score.toFixed(2)
            var quiz_gradebook = {
                "quiz_number": quiz_number,
                "quiz_id": quiz.id,
                "question": quiz.question,
                "include": quiz.include,
                "total_participants": quiz.include ? total_participants.toString() : '-',
                "average_score": quiz.include ? average_score : '-',
            }
            lecture_gradebooks.gradebooks.push(quiz_gradebook);
            quiz_number += 1;
        });
        // return res.status(200).send({ data: lecture_gradebooks, message: "Get quizzes grade by lecture is successful."});
        // return res.status(200).send({ data: lecture_gradebooks, message: "Nilai pertanyaan-pertanyaan berdasarkan sesi telah berhasil didapatkan."});
        return res.status(200).send(lecture_gradebooks);
    });
});

router.put('/faculty/courses/:course_id/lectures/:lecture_id/quizzes/', verifyToken, async function(req,res,next){
    // if (req.role != "faculty") return res.status(401).send({ message: "Only facultys are allowed to see this page.", data: null});
    if (req.role != "faculty") return res.status(401).send({ message: "Hanya fakultas yang dapat mengganti pertanyaan-pertanyaan yang masuk dalam daftar nilai.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        // if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (err) { return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan kelas.", data: null }); }
        // if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (!course) return res.status(404).send({ message: "Kelas " + req.params.course_id + " tidak ditemukan.", data: null });
        // if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the faculty of this course.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "ID pengguna aplikasi tidak sama dengan ID fakultas di dalam kelas.", data: null});

        var lecture = undefined;
        var lecture_index = undefined;
        for (var i=0; i<course.lectures.length; i++){
            if (course.lectures[i].id == req.params.lecture_id) {
                lecture = course.lectures[i];
                lecture_index = i;
                break;
            }
        }
        if (lecture == undefined) {
            // return res.status(404).send({ message: "Lecture " + req.params.lecture_id + " not found.", data: null });
            return res.status(404).send({ message: "Sesi " + req.params.lecture_id + " tidak ditemukan.", data: null });
        } else {
            var queries = {};
            req.body.quizzes.forEach( quiz => {
                for (var i=0; i<lecture.quizzes.length; i++){
                    if (lecture.quizzes[i].id == quiz.quiz_id) {
                        var query = "lectures." + lecture_index + ".quizzes." + i + ".include";
                        queries[query] = quiz.include;
                    } else {
                        continue;
                    }
                }
            });
            Course.findByIdAndUpdate(req.params.course_id, {$set: queries}, {new: true}, async function(err, course){
                // if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
                if (err) { return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan kelas.", data: null }); }
                // if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
                if (!course) return res.status(404).send({ message: "Kelas " + req.params.course_id + " tidak ditemukan.", data: null });
                // if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the faculty of this course.", data: null});
                if (course.instructor_id != req.userId) return res.status(401).send({ message: "ID pengguna aplikasi tidak sama dengan ID fakultas di dalam kelas.", data: null});
                var lecture_gradebooks = {}
                lecture_gradebooks["gradebooks_by_quizzes"] = []
                lecture_gradebooks["gradebooks_by_students"] = []
                var lecture_info = null
                for (var i=0; i<course.lectures.length; i++){
                    if (course.lectures[i].id == req.params.lecture_id) {
                        lecture_info = course.lectures[i];
                        break;
                    }
                }
                // if (lecture_info == null) return res.status(404).send({ message: "Lecture " + req.params.lecture_id + " not found.", data: null });
                if (lecture_info == null) return res.status(404).send({ message: "Sesi " + req.params.lecture_id + " tidak ditemukan.", data: null });
                var participation_reward = lecture_info.participation_reward_percentage;
                var quiz_number = 1;
                lecture_info.quizzes.forEach(quiz => {
                    var total_participants = 0;
                    var average_score = 0;
                    var accuracy_pts = 0;
                    var participation_pts = 0;
                    var max_accuracy_pts = 0;
                    for (var [user_id, course_answers] of course.course_gradebook.entries()){
                        if (course_answers.role != "faculty") {
                            if (course_answers.lectures_record[req.params.lecture_id].present && course_answers.lectures_record[req.params.lecture_id].quiz_answers[quiz.id] != undefined) {
                                if (course_answers.lectures_record[req.params.lecture_id].quiz_answers[quiz.id] == quiz.correct_answer) {
                                    accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                                }
                                total_participants += 1;
                                participation_pts += (participation_reward/100) * quiz.point;
                                max_accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                            }
                        }
                    }
                    average_score = ((accuracy_pts+participation_pts)/(max_accuracy_pts+participation_pts))*100
                    average_score = isNaN(average_score) ? '0.00' : average_score.toFixed(2)
                    var quiz_gradebook = {
                        "quiz_number": quiz_number,
                        "quiz_id": quiz.id,
                        "question": quiz.question,
                        "include": quiz.include,
                        "total_participants": quiz.include ? total_participants.toString() : '-',
                        "average_score": quiz.include ? average_score : '-',
                    }
                    lecture_gradebooks.gradebooks_by_quizzes.push(quiz_gradebook);
                    quiz_number += 1;
                });
                for (var [user_id, course_answers] of course.course_gradebook.entries()){
                    var student = await User.findById(user_id);
                    if (course_answers.role == "student") {
                        var student_lecture_info = course_answers.lectures_record[req.params.lecture_id];
                        var total_pts = 0;
                        var accuracy_pts = 0;
                        var participation_pts = 0;
                        var max_accuracy_pts = 0;
                        var max_participation_pts = 0;
                        var any_included = false;
                        lecture_info.quizzes.forEach(quiz => {
                            if (quiz.include == true) {
                                any_included = true;
                                max_accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                                max_participation_pts += (participation_reward / 100) * quiz.point;
                                if (student_lecture_info.present && student_lecture_info.quiz_answers[quiz.id] != undefined) {
                                    participation_pts += (participation_reward / 100) * quiz.point;
                                    if (student_lecture_info.quiz_answers[quiz.id] == quiz.correct_answer) {
                                        accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                                    }
                                }
                            }
                        });
                        total_pts = (accuracy_pts+participation_pts) / (max_accuracy_pts+max_participation_pts) * 100;
                        var student_gradebook = {
                            "first_name": student.first_name,
                            "last_name": student.last_name,
                            "email": student.email,
                            "attendance" : student_lecture_info.present,
                            "participation_average_score": any_included ? participation_pts.toFixed(2) : '-',
                            "accuracy_average_score": any_included ? accuracy_pts.toFixed(2) : '-',
                            "total_average_score": any_included ? total_pts.toFixed(2) : '-',
                        }
                        lecture_gradebooks.gradebooks_by_students.push(student_gradebook);
                    }
                }
                lecture_gradebooks["gradebooks_by_students"].sort((a,b) => (a.first_name > b.first_name) ? 1 : ((b.last_nom > a.last_nom) ? -1 : 0)); 

                // return res.status(200).send({data: lecture_gradebooks, message: "Update included quizzes are successful"});
                // return res.status(200).send({data: lecture_gradebooks, message: "Pertanyaan-pertanyaan yang akan dimasukkan ke dalam daftar nilai telah berhasil diganti"});
                return res.status(200).send(lecture_gradebooks);
            });
        }
    });
});

router.get('/faculty/courses/:course_id/lectures', verifyToken, async function(req,res,next){
    // if (req.role != "faculty") return res.status(401).send({ message: "Only facultys are allowed to see this data.", data: null});
    if (req.role != "faculty") return res.status(401).send({ message: "Hanya fakultas yang dapat mengakses data ini.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        // if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (err) { return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan kelas.", data: null }); }
        // if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (!course) return res.status(404).send({ message: "Kelas " + req.params.course_id + " tidak ditemukan.", data: null });
        // if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the faculty of this course.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "ID pengguna aplikasi tidak sama dengan ID fakultas di dalam kelas.", data: null});


        var lecture_gradebooks = {
            "number_of_students": course.number_of_students,
            "class_average": await get_class_average(course),
            "gradebooks": []
        }
        var getting_lectures = course.lectures.map( lecture_info => {
            if (lecture_info.has_lived) {
                var total_lecture_score = 0;
                var participation_reward = lecture_info.participation_reward_percentage;
                for (var [user_id, course_answers] of course.course_gradebook.entries()){
                    if (course_answers.role == "student") {
                        var student_lecture_info = course_answers.lectures_record[lecture_info.id];
                        var total_pts = 0;
                        var accuracy_pts = 0;
                        var participation_pts = 0;
                        var max_accuracy_pts = 0;
                        var max_participation_pts = 0;
                        var has_include = false;
                        lecture_info.quizzes.forEach(quiz => {
                            if (quiz.include == true) {
                                has_include = true;
                                max_accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                                max_participation_pts += (participation_reward / 100) * quiz.point;
                                if (student_lecture_info.present && student_lecture_info.quiz_answers[quiz.id] != undefined) {
                                    participation_pts += (participation_reward / 100) * quiz.point;
                                    if (student_lecture_info.quiz_answers[quiz.id] == quiz.correct_answer) {
                                        accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                                    }
                                }
                            }
                        });
                        total_pts = (accuracy_pts+participation_pts) / (max_accuracy_pts+max_participation_pts) * 100;   
                        total_lecture_score +=  total_pts; 
                    }
                } 

                var lecture_gradebook = {
                    "lecture_id": lecture_info.id,
                    "date": lecture_info.date,
                    "participation_reward_percentage": lecture_info.participation_reward_percentage,
                    "attendance": lecture_info.attendance,
                    "total_average_score": has_include ? (total_lecture_score/(course.course_gradebook.size-1)).toFixed(2) : '-'
                }
                return lecture_gradebook;
            } else {
                var lecture_gradebook = {
                    "lecture_id": lecture_info.id,
                    "date": lecture_info.date,
                    "participation_reward_percentage": lecture_info.participation_reward_percentage,
                    "attendance": '-',
                    "total_average_score": '-'
                }
                return lecture_gradebook;
            }
        });
        var lectures = await Promise.all(getting_lectures);
        lecture_gradebooks["gradebooks"] = lectures;
        // return res.status(200).send({ data: lecture_gradebooks, message: "Get lectures grade is successful."});
        // return res.status(200).send({ data: lecture_gradebooks, message: "Nilai sesi-sesi berdasarkan kelas telah berhasil didapatkan."});
        return res.status(200).send(lecture_gradebooks);
    });    
});

router.put('/faculty/courses/:course_id/lectures/:lecture_id', verifyToken, function (req, res, next) {
    // if (req.role != "faculty") return res.status(401).send({ message: "Only facultys are allowed to see this page.", data: null});
    if (req.role != "faculty") return res.status(401).send({ message: "Hanya fakultas yang dapat mengganti setting sesi.", data: null});
    var participation_reward_percentage = parseInt(req.body.participation_reward_percentage);
    if (participation_reward_percentage < 0 || participation_reward_percentage > 100 || isNaN(participation_reward_percentage)) {
        // return res.status(500).send({ message: "Please provide valid participation_reward_percentage.", data: null});
        return res.status(500).send({ message: "Mohon memberi persentase nilai yang benar (0-100).", data: null});
    }
    Course.findById(req.params.course_id, function(err, course){
        // if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (err) { return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan kelas.", data: null }); }
        // if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (!course) return res.status(404).send({ message: "Kelas " + req.params.course_id + " tidak ditemukan.", data: null });
        // if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the faculty of this course.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "ID pengguna aplikasi tidak sama dengan ID fakultas di dalam kelas.", data: null});

        var lecture_index = undefined;
        for (var i=0; i<course.lectures.length; i++) {
            if (course.lectures[i].id == req.params.lecture_id) {
                lecture_index = i;
                break;
            }
        }

        if (lecture_index == undefined) {
            // return res.status(404).send({ message: "Lecture id not found.", data: null});
            return res.status(404).send({ message: "Sesi tidak ditemukan.", data: null});
        } else {
            var query = "lectures." + lecture_index + ".participation_reward_percentage";
            Course.findByIdAndUpdate(req.params.course_id, {$set: {[query]: participation_reward_percentage}}, {new: true}, async function(err, course){
                // if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
                if (err) { return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan kelas.", data: null }); }
                // if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
                if (!course) return res.status(404).send({ message: "Kelas " + req.params.course_id + " tidak ditemukan.", data: null });
                // if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the faculty of this course.", data: null});
                if (course.instructor_id != req.userId) return res.status(401).send({ message: "ID pengguna aplikasi tidak sama dengan ID fakultas di dalam kelas.", data: null});


                var lecture_gradebooks = {
                    "number_of_students": course.number_of_students,
                    "class_average": await get_class_average(course),
                    "gradebooks": []
                }
                var getting_lectures = course.lectures.map( lecture_info => {
                    if (lecture_info.has_lived) {
                        var total_lecture_score = 0;
                        var participation_reward = lecture_info.participation_reward_percentage;
                        for (var [user_id, course_answers] of course.course_gradebook.entries()){
                            if (course_answers.role == "student") {
                                var student_lecture_info = course_answers.lectures_record[lecture_info.id];
                                var total_pts = 0;
                                var accuracy_pts = 0;
                                var participation_pts = 0;
                                var max_accuracy_pts = 0;
                                var max_participation_pts = 0;
                                lecture_info.quizzes.forEach(quiz => {
                                    if (quiz.include == true) {
                                        max_accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                                        max_participation_pts += (participation_reward / 100) * quiz.point;
                                        if (student_lecture_info.present && student_lecture_info.quiz_answers[quiz.id] != undefined) {
                                            participation_pts += (participation_reward / 100) * quiz.point;
                                            if (student_lecture_info.quiz_answers[quiz.id] == quiz.correct_answer) {
                                                accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                                            }
                                        }
                                    }
                                });
                                total_pts = (accuracy_pts+participation_pts) / (max_accuracy_pts+max_participation_pts) * 100;   
                                total_lecture_score +=  total_pts; 
                            }
                        } 

                        var lecture_gradebook = {
                            "lecture_id": lecture_info.id,
                            "date": lecture_info.date,
                            "attendance": lecture_info.attendance,
                            "participation_reward_percentage": lecture_info.participation_reward_percentage,
                            "total_average_score": (total_lecture_score/(course.course_gradebook.size-1)).toFixed(2)
                        }
                        return lecture_gradebook;
                    } else {
                        var lecture_gradebook = {
                            "lecture_id": lecture_info.id,
                            "date": lecture_info.date,
                            "participation_reward_percentage": lecture_info.participation_reward_percentage,
                            "attendance": '-',
                            "total_average_score": '-'
                        }
                        return lecture_gradebook;
                    }
                });
                var lectures = await Promise.all(getting_lectures);
                lecture_gradebooks["gradebooks"] = lectures;
                // return res.status(200).send({data: lecture_gradebooks, message: "Change participation point reward percentage for quiz is a success"});
                // return res.status(200).send({data: lecture_gradebooks, message: "Persentase nilai partisipasi sudah berhasil diganti."});
                return res.status(200).send(lecture_gradebooks);
            });
        }
    });
});

router.get('/faculty/courses/:course_id/students', verifyToken, async function(req,res,next){
    console.log('hello')
    // if (req.role != "faculty") return res.status(401).send({ message: "Only facultys are allowed to see this data.", data: null});
    if (req.role != "faculty") return res.status(401).send({ message: "Hanya fakultas yang dapat melihat data ini.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        // if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (err) { return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan kelas.", data: null }); }
        // if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (!course) return res.status(404).send({ message: "Kelas " + req.params.course_id + " tidak ditemukan.", data: null });
        // if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the faculty of this course.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "ID pengguna aplikasi tidak sama dengan ID fakultas di dalam kelas.", data: null});


        var lecture_gradebooks = {
            "number_of_students": course.number_of_students,
            "class_average": await get_class_average(course),
            "gradebooks": []
        }

        var student_ids = [];
        for (var[user_id, course_answers] of course.course_gradebook.entries()){
            if (course_answers.role == "student") {
                student_ids.push(user_id);
            }
        }
        
        var getting_student_infos = student_ids.map(async student_id => {
            student = await User.findById(student_id);
            student_obj = {
                key: student_id,
                value: {
                    first_name: student.first_name,
                    last_name: student.last_name,
                    email: student.email,
                    total_participation_score: 0,
                    total_accuracy_score: 0,
                    total_score: 0
                }
            }
            return student_obj;
        });

        var student_infos = await Promise.all(getting_student_infos);
        var gradebooks = student_infos.reduce((obj, item) => (obj[item.key] = item.value, obj) ,{});

        var lecture_counter = 0;
        course.lectures.forEach( lecture_info => {
            if (lecture_info.has_lived) {
                lecture_counter += 1;
                var participation_reward = lecture_info.participation_reward_percentage;
                for (var [user_id, course_answers] of course.course_gradebook.entries()){
                    if (course_answers.role == "student") {
                        var student_lecture_info = course_answers.lectures_record[lecture_info.id];
                        var accuracy_pts = 0;
                        var participation_pts = 0;
                        var max_accuracy_pts = 0;
                        var max_participation_pts = 0;
                        lecture_info.quizzes.forEach(quiz => {
                            if (quiz.include == true) {
                                max_accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                                max_participation_pts += (participation_reward / 100) * quiz.point;
                                if (student_lecture_info.present && student_lecture_info.quiz_answers[quiz.id] != undefined) {
                                    participation_pts += (participation_reward / 100) * quiz.point;
                                    if (student_lecture_info.quiz_answers[quiz.id] == quiz.correct_answer) {
                                        accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                                    }
                                }
                            }
                        });
                        var total_accuracy_score = (accuracy_pts/max_accuracy_pts) * 100;
                        var total_participation_score = (participation_pts/max_participation_pts) * 100;
                        var total_score = (accuracy_pts+participation_pts) / (max_accuracy_pts+max_participation_pts) * 100;

                        gradebooks[user_id].total_accuracy_score += isNaN(total_accuracy_score) ? 0 : total_accuracy_score;
                        gradebooks[user_id].total_participation_score += isNaN(total_participation_score) ? 0 : total_participation_score;
                        gradebooks[user_id].total_score += isNaN(total_score) ? 0 : total_score; 
                    }
                } 
            }
        });
        gradebooks = Object.values(gradebooks).map(student_info => {
            var student_obj = {
                first_name: student_info.first_name,
                last_name: student_info.last_name,
                email: student_info.email,
                participation_average_score: lecture_counter != 0 ? (student_info.total_participation_score/lecture_counter).toFixed(2) : '-',
                accuracy_average_score : lecture_counter != 0 ? (student_info.total_accuracy_score/lecture_counter).toFixed(2) : '-',
                total_average_score: lecture_counter != 0 ? (student_info.total_score/lecture_counter) .toFixed(2) : '-'
            }
            return student_obj; 
        });
        gradebooks.sort((a,b) => (a.first_name > b.first_name) ? 1 : ((b.last_nom > a.last_nom) ? -1 : 0));lecture_gradebooks["gradebooks"] = gradebooks; 
        // return res.status(200).send({ data: lecture_gradebooks, message: "Get students grade by course is successful."});
        // return res.status(200).send({ data: lecture_gradebooks, message: "Nilai murid-murid berdasarkan kelas telah berhasil didapatkan."});
        return res.status(200).send(lecture_gradebooks);
    });    
});

router.get('/student/courses/:course_id/lectures', verifyToken, async function(req,res,next){
    // if (req.role != "student") return res.status(401).send({ message: "Only students are allowed to see this data.", data: null});
    if (req.role != "student") return res.status(401).send({ message: "Hanya murid yang dapat mengakses data ini.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        // if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (err) { return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan kelas.", data: null }); }
        // if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (!course) return res.status(404).send({ message: "Kelas " + req.params.course_id + " tidak ditemukan.", data: null });

        var course_answers = course.course_gradebook.get(req.userId);
        var gradebooks = [];
        course.lectures.forEach( lecture_info => {
            if (lecture_info.has_lived) {
                var participation_reward = lecture_info.participation_reward_percentage;
                var student_lecture_info = course_answers.lectures_record[lecture_info.id];
                var total_pts = 0;
                var accuracy_pts = 0;
                var participation_pts = 0;
                var max_accuracy_pts = 0;
                var max_participation_pts = 0;
                lecture_info.quizzes.forEach(quiz => {
                    if (quiz.include == true) {
                        max_accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                        max_participation_pts += (participation_reward / 100) * quiz.point;
                        if (student_lecture_info.present && student_lecture_info.quiz_answers[quiz.id] != undefined) {
                            participation_pts += (participation_reward / 100) * quiz.point;
                            if (student_lecture_info.quiz_answers[quiz.id] == quiz.correct_answer) {
                                accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                            }
                        }
                    }
                });
                total_pts = (accuracy_pts+participation_pts) / (max_accuracy_pts+max_participation_pts) * 100;   

                var lecture_gradebook = {
                    "lecture_id": lecture_info.id,
                    "date": lecture_info.date,
                    "attendance": student_lecture_info.present,
                    "average_score": student_lecture_info.present ? total_pts.toFixed(2) : '0'
                }
                gradebooks.push(lecture_gradebook);
            }
        });

        // return res.status(200).send({data: gradebooks, message: "Get student gradebook by lecture is successful."});
        // return res.status(200).send({data: gradebooks, message: "Nilai murid berdasarkan sesi telah berhasil didapatkan."});
        return res.status(200).send({gradebooks: gradebooks, message: "Nilai murid berdasarkan sesi telah berhasil didapatkan."});
    });  
});

module.exports = router;