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
    if (!req.body.description) {
        return res.status(500).send({ message: "Please provide description.", data: null});
    } else { 
        description = req.body.description.trim();
    }

    var class_date = "-";
    if (req.body.date) { 
        var date = toString(req.body.date.getDate);
        var month = toString(req.body.date.getMonth);
        var year = toString(req.body.date.getFullYear);
        class_date = month + '/' + date + '/' + year;
    }

    Counter.findByIdAndUpdate("lecture_id", {$inc: {value: 1}}, {new: true}).then(function(counter){
        var lecture = {
            id: counter.value,
            date: class_date,
            description: description,
            in_progess: false,
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
    if (req.role != "professor") return res.status(401).send({ message: "Only professor allowed to update course.", data: null});
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

// create quiz
router.post('/:lecture_id/quizzes', verifyToken, function(req,res,next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professor allowed to update course.", data: null});

    Course.findById(req.params.course_id, function(err, course){
        if (err) return res.status(500).send({ message: "There was a problem looking for the course.", data: null});
        if (!course) return res.status(404).send({ message: "Course not found.", data: null});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});


        var question, correct_answer, time_duration, total_point, participation_reward_percentage;
        var answers = [];

        if (!req.body.question) {
            return res.status(500).send({ message: "Please provide question.", data: null});
        } else {
            question = req.body.question.trim();
        }


        if (!req.body.answers || req.body.answers.length === 0 ) {
            return res.status(500).send({ message: "Please provide answers (number).", data: null});
        } else {
            for(var i=0; i<req.body.answers.length; i++){
                answers.push(req.body.answers[i].trim());
            }
        }
        
        if (!req.body.correct_answer || isNaN(req.body.correct_answer) || Number(req.body.correct_answer) >= req.body.answers.length) {
            return res.status(500).send({ message: "Please provide correct answer index.", data: null});
        } else {
            correct_answer = Number(req.body.correct_answer);
        }


        if (!req.body.time_duration || isNaN(req.body.time_duration)) {
            return res.status(500).send({ message: "Please provide time duration (number in seconds).", data: null});
        } else {
            time_duration = Number(req.body.time_duration);
        }

        if (!req.body.total_point || isNaN(req.body.total_point)) {
            return res.status(500).send({ message: "Please provide total point (number) for problem.", data: null})
        } else {
            total_point = Number(req.body.total_point);
        }

        if (!req.body.participation_reward_percentage) {
            participation_reward_percentage = 0;
        } else if(isNaN(req.body.participation_reward_percentage) || Number(req.body.participation_reward_percentage) < 0 || Number(req.body.participation_reward_percentage) > 100) {
            return res.status(500).send({ message: "Please provide percentage (number 0-100)", data: null})
        } else {
            participation_reward_percentage = Number(req.body.participation_reward_percentage);
        }

        var quiz = {
            question: question,
            answers: answers,
            correct_answer: correct_answer,
            time_duration: time_duration,
            total_point: total_point,
            participation_reward_percentage: participation_reward_percentage
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
        if (isNaN(req.params.index)) return res.status(500).send({ message: "Index is not a number.", data: null});

        var query = "lectures.$[i].quizzes." + req.params.index;
        Course.findByIdAndUpdate(req.params.course_id, {$unset: {[query]: 1}}, {arrayFilters: [{"i.id": Number(req.params.lecture_id)}], new: true, projection: {course_gradebook: 0}}, function(err, course){
            if (err) return res.status(500).send({ message: "There was a problem updating for the course.", data: null});
            if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null});
            if (course.instructor_id != req.userId) return res.status(401).send({ message: "The ID provided does not match the instructor ID for the course.", data: null});
            Course.findByIdAndUpdate(req.params.course_id, {$pull: {"lectures.$[i].quizzes": null}}, {arrayFilters: [{"i.id": Number(req.params.lecture_id)}], new: true, projection: {course_gradebook: 0}}, function(err, course){
                if (err) return res.status(500).send({ message: "There was a problem updating for the course.", data: null});
                if (!course) return res.status(404).send({ message: "Course " + req.params.course_id + " not found.", data: null});
                if (course.instructor_id != req.userId) return res.status(401).send({ message: "The ID provided does not match the instructor ID for the course."});
                return res.status(200).send({ message: "Quiz has been deleted.", data: course });
            });
        });
    });
});


// update quiz

module.exports = router;