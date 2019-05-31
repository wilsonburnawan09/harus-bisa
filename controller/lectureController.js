var express = require('express');
var router = express.Router({mergeParams: true});
var bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());
var User = require('../model/User');
var Course = require('../model/Course');
var Counter = require('../model/Counter');
var verifyToken = require('./auth/verifyTokenMiddleware');

// create lecture
router.post('/', verifyToken, function(req, res, next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professor allowed to update course.", data: null});
    var description = "";
    var date = "-";
    var participation_reward_percentage = 0;

    if (req.body.description != null) {
        description = req.body.description.trim();
    } 

    if (req.body.date) { 
        date = req.body.date.trim();
    }

    if (!req.body.participation_reward_percentage) {
        participation_reward_percentage = 0;
    } else if(isNaN(req.body.participation_reward_percentage) || Number(req.body.participation_reward_percentage) < 0 || Number(req.body.participation_reward_percentage) > 100) {
        return res.status(500).send({ message: "Please provide percentage (number 0-100)", data: null})
    } else {
        participation_reward_percentage = Number(req.body.participation_reward_percentage);
    }

    Counter.findByIdAndUpdate("lecture_id", {$inc: {value: 1}}, {new: true}).then(function(counter){
        var lecture = {
            id: counter.value,
            date: date,
            description: description,
            live: false,
            participation_reward_percentage: participation_reward_percentage,
            quizzes: []
        }
    
        Course.findById(req.params.course_id, function(err, course){
            if (err) return res.status(500).send({ message: "There was a problem looking for the course.", data: null});
            if (!course) return res.status(404).send({ message: "Course not found.", data: null});
            if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});

            Course.findByIdAndUpdate(req.params.course_id, {$push: {lectures: lecture}, $inc: {number_of_lectures: 1}}, {new: true, projection: {course_gradebook: 0}}, function(err, course){
                if (err) return res.status(500).send({ message: "There was a problem updating for the course.", data: null});
                if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null});
                if (course.instructor_id != req.userId) return res.status(401).send({ message: "The ID provided does not match the instructor ID for the course.", data: null});
                res.status(200).send({ message: "Lectures has been created.", data: course });
            });
        });
    });
});

// get lectures
router.get('/', verifyToken, function(req,res,next){
    Course.findById(req.params.course_id, function(err, course){
        if (err) {
            return res.status(500).send({ message: "There was a problem looking for the course.", data: null });
        }
        if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null });
        if (course.course_gradebook.has(req.userId)){
            var projected_course = Object.assign({}, course)._doc;
            delete projected_course.course_gradebook;
            res.status(200).send({ message: "Get lectures is successful.", data: projected_course });
        } else {
            res.status(401).send({message: "User is not in this course.", data: null });
        }
    });
});

// delete lecture
router.delete('/:lecture_id', verifyToken, function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professor allowed to delete lecture.", data: null});
    Course.findById(req.params.course_id, function(err, course){
        if (err) return res.status(500).send({ message: "There was a problem looking for the course.", data: null});
        if (!course) return res.status(404).send({ message: "Course not found.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});
        Course.findByIdAndUpdate(req.params.course_id, {$pull: {lectures: {id: Number(req.params.lecture_id)}}, $inc: {number_of_lectures: -1}}, {new: true, projection: {course_gradebook: 0}}, function(err, course){
            if (err) {
                return res.status(500).send({ message: "There was a problem deleting for the course.", data: null});
            }
            res.status(200).send({ message: "Lecture has been deleted", data: course});
        });
    });
});

// update lecture
router.put('/:lecture_id', verifyToken, function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professor allowed to update lecture.", data: null});
    Course.findById(req.params.course_id, function(err, course){
        if (err) return res.status(500).send({ message: "There was a problem looking for the course.", data: null});
        if (!course) return res.status(404).send({ message: "Course not found.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});

        for(var i=0; i<course.lectures.length; i++){
            if ( course.lectures[i].id == req.params.lecture_id) {
                if (req.body.date) { course.lectures[i].date = req.body.date.trim(); }
                if (req.body.description != null) { 
                    course.lectures[i].description = req.body.description.trim(); 
                }
                if (req.body.participation_reward_percentage) {
                    if (!isNaN(req.body.participation_reward_percentage) && req.body.participation_reward_percentage >= 0 && req.body.participation_reward_percentage <= 100) {
                        course.lectures[i].participation_reward_percentage = Number(req.body.participation_reward_percentage);
                    } else {
                        return res.status(500).send({ message: "Please provide valid participation_reward_percentage.", data: null});
                    }
                }
                break;
            }
        }
        course.markModified('lectures');
        course.save().then( () => { 
            res.status(200).send({ message: "Lecture has been updated.", data: course})
        })
        .catch(err => {
            res.status(500).send({ message: "There was a problem updating the lecture.", data: null});
        });
    });
});

// create quiz
router.post('/:lecture_id/quizzes', verifyToken, function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professor allowed to update course.", data: null});

    Course.findById(req.params.course_id, function(err, course){
        if (err) return res.status(500).send({ message: "There was a problem looking for the course.", data: null});
        if (!course) return res.status(404).send({ message: "Course not found.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});


        var question, correct_answer, time_duration, point;
        var answers = [];

        if (req.body.question) {
            question = req.body.question.trim();
        } else {
            question = "";
        }


        if (!req.body.answers || req.body.answers.length == 0 ) {
            return res.status(500).send({ message: "Please provide answers (number).", data: null});
        } else {
            if (!Array.isArray(req.body.answers)){
                answers.push(req.body.answers.trim());
            } else {
                for(var i=0; i<req.body.answers.length; i++){
                    answers.push(req.body.answers[i].trim());
                }
            }
        }
        
        if (req.body.correct_answer == null || isNaN(req.body.correct_answer) || Number(req.body.correct_answer) >= req.body.answers.length) {
            return res.status(500).send({ message: "Please provide correct answer index.", data: null});
        } else {
            correct_answer = Number(req.body.correct_answer);
        }


        if (!req.body.time_duration || isNaN(req.body.time_duration)) {
            return res.status(500).send({ message: "Please provide time duration (number in seconds).", data: null});
        } else {
            time_duration = Number(req.body.time_duration);
        }

        if (!req.body.point || isNaN(req.body.point)) {
            return res.status(500).send({ message: "Please provide question point (number) for problem.", data: null})
        } else {
            point = Number(req.body.point);
        }

        var quiz = {
            question: question,
            answers: answers,
            correct_answer: correct_answer,
            time_duration: time_duration,
            point: point,
        };

        Course.findByIdAndUpdate(req.params.course_id, {$push: {"lectures.$[i].quizzes": quiz}}, {arrayFilters: [{"i.id": Number(req.params.lecture_id)}], new: true, projection: {course_gradebook: 0}}, function(err, course){
            if (err) return res.status(500).send({ message: "There was a problem updating for the course.", data: null});
            if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null});
            if (course.instructor_id != req.userId) return res.status(401).send({ message: "The ID provided does not match the instructor ID for the course.", data: null});
            res.status(200).send({ message: "Quiz has been created", data: course });
        });
    });
});

// delete quiz
router.delete('/:lecture_id/quizzes/:index', verifyToken, function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professor allowed to update course.", data: null});

    Course.findById(req.params.course_id, function(err, course){
        if (err) return res.status(500).send({ message: "There was a problem looking for the course.", data: null});
        if (!course) return res.status(404).send({ message: "Course not found.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});
        if (isNaN(req.params.index)) return res.status(500).send({ message: "Quiz index is not a number.", data: null});

        var lecture_id = -1;
        for(var i = 0; i < course.lectures.length; i++){
            if (course.lectures[i].id == req.params.lecture_id) {
                lecture_id = i;
            }
        }

        if (lecture_id == -1) {
            return res.status(500).send({ message: "Lecture is not found.", data: null});
        }

        if (req.params.index < 0 || req.params.index >= course.lectures[lecture_id].quizzes.length){
            return res.status(500).send({ message: "Quiz index is invalid.", data: null})
        }

        var query = "lectures." + lecture_id + ".quizzes." + req.params.index;
        Course.findByIdAndUpdate(req.params.course_id, {$unset: {[query]: 1}}, {new: true, projection: {course_gradebook: 0}}, function(err, course){
            if (err) return res.status(500).send({ message: "There was a problem updating for the course.", data: null});
            var pull_from = "lectures." + lecture_id + ".quizzes";
            Course.findByIdAndUpdate(req.params.course_id, {$pull: {[pull_from]: null}}, {new: true, projection: {course_gradebook: 0}}, function(err, course){
                if (err) return res.status(500).send({ message: "There was a problem updating for the course.", data: null});
                return res.status(200).send({ message: "Quiz has been deleted.", data: course });
            });
        });
    });
});

// update quiz
router.put('/:lecture_id/quizzes/:index', verifyToken, function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professor allowed to update course.", data: null});
    Course.findById(req.params.course_id, function(err, course){
        if (err) return res.status(500).send({ message: "There was a problem looking for the course.", data: null});
        if (!course) return res.status(404).send({ message: "Course not found.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});
        if (isNaN(req.params.index)) return res.status(500).send({ message: "Index is not a number.", data: null});

        var lecture_index = null;
        for(var i=0; i<course.lectures.length; i++){
            if ( course.lectures[i].id == req.params.lecture_id) {
                lecture_index = i;
                break;
            }
        }

        var quiz_index = req.params.index;

        if (course.lectures[lecture_index] == null) { return res.status(500).send({ message: "Lecture not found.", data: null}); }
        if (course.lectures[lecture_index].quizzes[quiz_index] == null) { return res.status(500).send({ message: "Quiz not found.", data: null}); }

        if (req.body.question != null) { 
            course.lectures[lecture_index].quizzes[quiz_index].question = req.body.question.trim(); 
        }

        if (req.body.answers) {
            var answers = []
            cur_correct_answer = course.lectures[lecture_index].quizzes[quiz_index].correct_answer;
            if (!Array.isArray(req.body.answers)){
                if (cur_correct_answer > 0 && !req.body.correct_answer) {
                    return res.status(500).send({ message: "Please provide new correct answer index.", data: null});
                } else {
                    answers.push(req.body.answers.trim());
                }
            } else {
                if (cur_correct_answer >= req.body.answers.length && !req.body.correct_answer) {
                    return res.status(500).send({ message: "Please provide new correct answer index.", data: null});
                } else {
                    for(var i=0; i<req.body.answers.length; i++){
                        answers.push(req.body.answers[i].trim());
                    }
                }   
            }
            course.lectures[lecture_index].quizzes[quiz_index].answers = answers.slice(0);
        }

        if (req.body.correct_answer != null) {
            if (!isNaN(req.body.correct_answer) && 
            req.body.correct_answer < course.lectures[lecture_index].quizzes[quiz_index].answers.length &&
            req.body.correct_answer >= 0) {
                course.lectures[lecture_index].quizzes[quiz_index].correct_answer = Number(req.body.correct_answer);
            }
        }

        if (req.body.time_duration) {
            if (!isNaN(req.body.time_duration)) {
                course.lectures[lecture_index].quizzes[quiz_index].time_duration = Number(req.body.time_duration);
            } else {
                return res.status(500).send({ message: "Please provide valid time duration (number in seconds).", data: null});
            }
        }
        
        if (req.body.point) {
            if (!isNaN(req.body.point)) {
                course.lectures[lecture_index].quizzes[quiz_index].point = Number(req.body.point);
            } else {
                return res.status(500).send({ message: "Please provide valid question point.", data: null});
            }
        }

        course.markModified('lectures');
        course.save().then( () => { 
            return res.status(200).send({ message: "Quiz has been updated.", data: course})
        })
        .catch(err => {
            return res.status(500).send({ message: "There was a problem updating the quiz.", data: null});
        });
    });
});

module.exports = router;

// update quiz order
router.put('/:lecture_id/quizzes/:index/order/:direction', verifyToken, function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professor allowed to update course.", data: null});
    Course.findById(req.params.course_id, function(err, course){
        if (err) return res.status(500).send({ message: "There was a problem looking for the course.", data: null});
        if (!course) return res.status(404).send({ message: "Course not found.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});
        if (isNaN(req.params.index)) return res.status(500).send({ message: "Index is not a number.", data: null});

        var lecture_index = null;
        for(var i=0; i<course.lectures.length; i++){
            if ( course.lectures[i].id == req.params.lecture_id) {
                lecture_index = i;
                break;
            }
        }


        var quiz_index = Number(req.params.index);
        if (course.lectures[lecture_index] == null) { return res.status(500).send({ message: "Lecture not found.", data: null}); }
        if (course.lectures[lecture_index].quizzes[quiz_index] == null) { return res.status(500).send({ message: "Quiz not found.", data: null}); }

        var dir = req.params.direction;
        if (dir != "up" && dir != "down"){
            return res.status(500).send({ message: "Direction is invalid (only accepts 'up' or 'down')."});
        } else {
            if (dir == "up"){
                if (quiz_index == 0){
                    return res.status(500).send({ message: "Cannot go up, you are at the top.", data: null});
                } else {
                    var temp = course.lectures[lecture_index].quizzes[quiz_index-1];
                    course.lectures[lecture_index].quizzes[quiz_index-1] = course.lectures[lecture_index].quizzes[quiz_index];
                    course.lectures[lecture_index].quizzes[quiz_index] = temp;
                }
            } else if (dir == "down"){
                if (quiz_index == course.lectures[lecture_index].quizzes.length - 1){
                    return res.status(500).send({ message: "Cannot go down, you are at the bottom.", data: null});
                } else {
                    var temp = course.lectures[lecture_index].quizzes[quiz_index+1];
                    course.lectures[lecture_index].quizzes[quiz_index+1] = course.lectures[lecture_index].quizzes[quiz_index];
                    course.lectures[lecture_index].quizzes[quiz_index] = temp;
                }
            }
        }
        
        course.markModified('lectures');
        course.save().then( () => { 
            return res.status(200).send({ message: "Quiz order has been updated.", data: course})
        })
        .catch(err => {
            return res.status(500).send({ message: "There was a problem updating the quiz.", data: null});
        });
    });
});
