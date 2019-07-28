var express = require('express');
var router = express.Router({mergeParams: true});
var bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());
var User = require('../model/User');
var Course = require('../model/Course');
var verifyToken = require('./auth/verifyTokenMiddleware');

async function get_class_average(course) { 
    var lecture_counter = 0;
    var getting_lectures_average = course.lectures.map(lecture_info => {
        if (lecture_info.has_lived) {
            var total_lecture_score = 0;
            lecture_counter += 1;
            var participation_reward = lecture_info.participation_reward_percentage;
            for (var [user_id, course_answers] of course.course_gradebook.entries()){
                if (course_answers.role == "student") {
                    var student_lecture_info = course_answers.lecture_grades[lecture_info.id];
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
            return (total_lecture_score/(course.course_gradebook.size-1));
        } else {
            return 0;
        }
    });
    var lectures_total_score = await Promise.all(getting_lectures_average);
    var lectures_average = (lectures_total_score.reduce((accum,value) => accum + value, 0)/lecture_counter).toFixed(2);
    return lectures_average;
}

router.get('/professor/courses/:course_id/lectures/:lecture_id/students', verifyToken, async function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professors are allowed to see this page.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});
        var lecture_gradebooks = {
            number_of_students: course.number_of_students,
            class_average: await get_class_average(course),
            gradebooks: []
        }
        var lecture_info = null
        for (var i=0; i<course.lectures.length; i++){
            if (course.lectures[i].id == req.params.lecture_id) {
                lecture_info = course.lectures[i];
                break;
            }
        }
        if (lecture_info == null || lecture_info.has_lived == false) return res.status(404).send({ message: "Lecture " + req.params.lecture_id + " not found or never started.", data: null });
        var participation_reward = lecture_info.participation_reward_percentage;
        for (var [user_id, course_answers] of course.course_gradebook.entries()){
            var student = await User.findById(user_id);
            if (course_answers.role == "student") {
                var student_lecture_info = course_answers.lecture_grades[req.params.lecture_id];
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
                var student_gradebook = {
                    "first_name": student.first_name,
                    "last_name": student.last_name,
                    "email": student.email,
                    "attendance" : student_lecture_info.present,
                    "participation_average_score": participation_pts.toFixed(2),
                    "accuracy_average_score": accuracy_pts.toFixed(2),
                    "total_average_score": total_pts.toFixed(2),
                }
                lecture_gradebooks.gradebooks.push(student_gradebook);
            }
        }
        lecture_gradebooks["gradebooks"].sort((a,b) => (a.first_name > b.first_name) ? 1 : ((b.last_nom > a.last_nom) ? -1 : 0)); 
        return res.status(200).send(lecture_gradebooks);
    });
});

router.get('/professor/courses/:course_id/lectures/:lecture_id/quizzes', verifyToken, async function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professors are allowed to see this page.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});
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
        if (lecture_info == null || lecture_info.has_lived == false) return res.status(404).send({ message: "Lecture " + req.params.lecture_id + " not found or never started.", data: null });
        var participation_reward = lecture_info.participation_reward_percentage;
        var quiz_number = 1;
        lecture_info.quizzes.forEach(quiz => {
            var total_participants = 0;
            var average_score = 0;
            var accuracy_pts = 0;
            var participation_pts = 0;
            var max_accuracy_pts = 0;
            for (var [user_id, course_answers] of course.course_gradebook.entries()){
                if (course_answers.role != "professor") {
                    if (course_answers.lecture_grades[req.params.lecture_id].present && course_answers.lecture_grades[req.params.lecture_id].quiz_answers[quiz.id] != undefined) {
                        if (course_answers.lecture_grades[req.params.lecture_id].quiz_answers[quiz.id] == quiz.correct_answer) {
                            accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                        }
                        total_participants += 1;
                        participation_pts += (participation_reward/100) * quiz.point;
                        max_accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                    }
                }
            }
            average_score = ((accuracy_pts+participation_pts)/(max_accuracy_pts+participation_pts))*100
            var quiz_gradebook = {
                "quiz_number": quiz_number,
                "quiz_id": quiz.id,
                "question": quiz.question,
                "include": quiz.include,
                "total_participants": quiz.include ? total_participants.toString() : '-',
                "average_score": quiz.include ? average_score.toFixed(2) : '-',
            }
            lecture_gradebooks.gradebooks.push(quiz_gradebook);
            quiz_number += 1;
        });
        return res.status(200).send(lecture_gradebooks);
    });
});

router.put('/professor/courses/:course_id/lectures/:lecture_id/quizzes/', verifyToken, async function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professors are allowed to see this page.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});

        var lecture_info = null;
        for (var i=0; i<course.lectures.length; i++){
            if (course.lectures[i].id == req.params.lecture_id) {
                lecture_info = course.lectures[i];
                break;
            }
        }
        if (lecture_info == null) return res.status(404).send({ message: "Lecture " + req.params.lecture_id + " not found.", data: null });

        var lecture_gradebooks = {}
        lecture_gradebooks["number_of_students"] = course.number_of_students;
        lecture_gradebooks["class_average"] = await get_class_average(course)
        lecture_gradebooks["gradebooks"] = []
        var lecture_info = null;
        for (var i=0; i<course.lectures.length; i++){
            if (course.lectures[i].id == req.params.lecture_id) {
                lecture_info = course.lectures[i];
                break;
            }
        }
        if (lecture_info == null || lecture_info.has_lived == false) return res.status(404).send({ message: "Lecture " + req.params.lecture_id + " not found or never started.", data: null });
        var participation_reward = lecture_info.participation_reward_percentage;
        lecture_info.quizzes.forEach(quiz => {
            var total_participants = 0;
            var average_score = 0;
            var accuracy_pts = 0;
            var participation_pts = 0;
            var max_accuracy_pts = 0;
            for (var [user_id, course_answers] of course.course_gradebook.entries()){
                if (course_answers.role != "professor") {
                    if (course_answers.lecture_grades[req.params.lecture_id].present && course_answers.lecture_grades[req.params.lecture_id].quiz_answers[quiz.id] != undefined) {
                        if (course_answers.lecture_grades[req.params.lecture_id].quiz_answers[quiz.id] == quiz.correct_answer) {
                            accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                        }
                        total_participants += 1;
                        participation_pts += (participation_reward/100) * quiz.point;
                        max_accuracy_pts += ( (100 - participation_reward) / 100 ) * quiz.point;
                    }
                }
            }
            average_score = ((accuracy_pts+participation_pts)/(max_accuracy_pts+participation_pts))*100
            var quiz_gradebook = {
                "question": quiz.question,
                "include": quiz.include,
                "total_participants": quiz.include ? total_participants.toString() : '-',
                "average_score": quiz.include ? average_score.toFixed(2) : '-',
            }
            lecture_gradebooks.gradebooks.push(quiz_gradebook);
        });
        return res.status(200).send(lecture_gradebooks);
    });
});

router.get('/professor/courses/:course_id/lectures', verifyToken, async function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professors are allowed to see this page.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});


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
                        var student_lecture_info = course_answers.lecture_grades[lecture_info.id];
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
                    "total_average_score": (total_lecture_score/(course.course_gradebook.size-1)).toFixed(2)
                }
                return lecture_gradebook;
            } else {
                var lecture_gradebook = {
                    "lecture_id": lecture_info.id,
                    "date": lecture_info.date,
                    "attendance": '-',
                    "total_average_score": '-'
                }
                return lecture_gradebook;
            }
        });
        var lectures = await Promise.all(getting_lectures);
        lecture_gradebooks["gradebooks"] = lectures;
        return res.status(200).send(lecture_gradebooks);
    });    
});

router.get('/professor/courses/:course_id/students', verifyToken, async function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professors are allowed to see this page.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});


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
                        var student_lecture_info = course_answers.lecture_grades[lecture_info.id];
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

                        gradebooks[user_id].total_accuracy_score += (accuracy_pts/max_accuracy_pts) * 100;
                        gradebooks[user_id].total_participation_score += (participation_pts/max_participation_pts) * 100;
                        gradebooks[user_id].total_score += (accuracy_pts+participation_pts) / (max_accuracy_pts+max_participation_pts) * 100;   
                    }
                } 
            }
        });
        gradebooks = Object.values(gradebooks).map(student_info => {
            var student_obj = {
                first_name: student_info.first_name,
                last_name: student_info.last_name,
                email: student_info.email,
                participation_average_score: (student_info.total_participation_score/lecture_counter).toFixed(2),
                accuracy_average_score :(student_info.total_accuracy_score/lecture_counter).toFixed(2),
                total_average_score: (student_info.total_score/lecture_counter).toFixed(2)
            }
            return student_obj; 
        });
        gradebooks.sort((a,b) => (a.first_name > b.first_name) ? 1 : ((b.last_nom > a.last_nom) ? -1 : 0));lecture_gradebooks["gradebooks"] = gradebooks; 
        return res.status(200).send(lecture_gradebooks);
    });    
});

router.get('/student/courses/:course_id/lectures', verifyToken, async function(req,res,next){
    if (req.role != "student") return res.status(401).send({ message: "Only students are allowed to see this page.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });

        var course_answers = course.course_gradebook.get(req.userId);
        var gradebooks = [];
        course.lectures.forEach( lecture_info => {
            if (lecture_info.has_lived) {
                var participation_reward = lecture_info.participation_reward_percentage;
                var student_lecture_info = course_answers.lecture_grades[lecture_info.id];
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
                    "average_score": total_pts.toFixed(2)
                }
                gradebooks.push(lecture_gradebook);
            }
        });

        return res.status(200).send({gradebooks: gradebooks});
    });  
});

module.exports = router;