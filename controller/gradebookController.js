var express = require('express');
var router = express.Router({mergeParams: true});
var bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());
var User = require('../model/User');
var Course = require('../model/Course');
var verifyToken = require('./auth/verifyTokenMiddleware');

router.get('/professor/courses/:course_id/lectures/:lecture_id/students', verifyToken, async function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professors are allowed to see this page.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});
        var lecture_gradebooks = {}
        lecture_gradebooks["number_of_students"] = course.number_of_students;
        lecture_gradebooks["class_average"] = "89.5"
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
        for (var [user_id, course_answers] of course.course_gradebook.entries()){
            var student = await User.findById(user_id);
            if (course_answers.role == "student") {
                var student_gradebook = {}
                var student_lecture_info = course_answers.lecture_grades[req.params.lecture_id];
                student_gradebook["attendance"] = student_lecture_info.present;
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
                student_gradebook["first_name"] = student.first_name;
                student_gradebook["last_name"] = student.last_name;
                student_gradebook["email"] = student.email;
                student_gradebook["participation_average_score"] = participation_pts.toFixed(2);
                student_gradebook["accuracy_average_score"] = accuracy_pts.toFixed(2);
                student_gradebook["total_average_score"] = total_pts.toFixed(2);
                lecture_gradebooks.gradebooks.push(student_gradebook);
            }
        }
        lecture_gradebooks["gradebooks"].sort((a,b) => (a.first_name > b.first_name) ? 1 : ((b.last_nom > a.last_nom) ? -1 : 0)); 
        return res.status(200).send(lecture_gradebooks);
    });
});

router.get('/professor/courses/:course_id/lectures/:lecture_id/questions', verifyToken, async function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professors are allowed to see this page.", data: null});
    Course.findById(req.params.course_id, async function(err, course){
        if (err) { return res.status(500).send({ message: "There was a problem looking for the course.", data: null }); }
        if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});
        var lecture_gradebooks = {}
        lecture_gradebooks["number_of_students"] = course.number_of_students;
        lecture_gradebooks["class_average"] = "89.5"
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
        lecture_info.quizzes.forEach(quiz => {
            var quiz_gradebook = {}
            var total_participants = 0;
            var average_score = 0;
            var accuracy_pts = 0;
            var participation_pts = 0;
            var max_accuracy_pts = 0;
            var max_total_score = 0;
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

            quiz_gradebook["question"] = quiz.question;
            quiz_gradebook["include"] = quiz.include;
            quiz_gradebook["total_participants"] = quiz.include ? total_participants.toString() : '-';
            quiz_gradebook["average_score"] = quiz.include ? average_score.toFixed(2) : '-';
            lecture_gradebooks.gradebooks.push(quiz_gradebook);
        });
        return res.status(200).send(lecture_gradebooks);
    });
});

// {
//     "number_of_students": "string",
//     "class_average": "string",
//     "gradebooks": [
//       {
//         "question": "string",
//         "total_participants": "string",
//         "average_score": "string",
//         "included": true
//       }
//     ]
//   }


module.exports = router;