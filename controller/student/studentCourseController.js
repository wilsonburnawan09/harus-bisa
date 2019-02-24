var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());
var User = require('../../model/User');
var Course = require('../../model/Course');
var verifyToken = require('../auth/verifyTokenMiddleware');

// add course
router.post('/', verifyToken, function(req, res, next){
    if (req.role != "student") return res.status(401).send({ message: "Only student allowed to add course."});
    Course.findOne({join_code: req.body.join_code}, function(err, course){
        if (err) return res.status(500).send({ message: "There was a problem finding the course."});
        if (!course) return res.status(404).send({ message: "Course not found."});
        if (course.course_gradebook.has(String(req.userId))) return res.status(409).send({ message: "Student is already in the course gradebook."});
        User.findOne({_id: req.userId}, function(err, user){
            if (err) return res.status(500).send({ message: "There was a problem finding the student."});
            if (!user) return res.status(404).send({ message: "User not found."});
            var course_added = false;
            for (var i = 0; i < user.courses.length; i++){
                if(String(user.courses[i]) == String(course._id)) {
                    course_added = true;
                    break;
                }
            }
            if (!course_added){
                user.courses.push(course._id);

                user.save(function(err){
                    if(err) return res.status(500).send({user: user, message: "There was a problem addding the course"});
                    var student_gradebook = {
                        role: "student",
                        overall: "NA",
                        lectures_grade: []
                    }
                    var new_student = "course_gradebook." + String(user._id);
                    Course.findByIdAndUpdate(course._id, {$set : {[new_student]: student_gradebook}}, {new: true}, function(err, course){
                        if (err) return res.status(500).send({ message: "There was a problem adding the user to the course."});
                        res.status(201).send(course);
                    });
                });
            } else {
                res.status(409).send({ message: "Course is already in the student course list."});
            }
        })
    });
});

// get courses
router.get('/', verifyToken, function(req, res, next) {
    if (req.role != "student") return res.status(401).send({ message: "You are not a student."});
    User.findById(req.userId, async function(err, user){
        if(err) return res.status(500).send({ message: "There was a problem getting the user information."});
        if(!user) return res.status(404).send({ message: "User " + req.userId + " not found." });
        Promise.all(user.courses.map(async (course_id) => {
            var course_promise;
            await Course.findById(course_id, function(err, course){
                var course = course.toObject();
                delete course.course_gradebook;
                delete course.lectures;
                course_promise = course;
            })
            return course_promise;
        }))
        .then(courses => {
            res.status(200).send(courses);
        })
        .catch(err => {
            res.status(500).send({ message: "There was a problem getting the courses."});
        }) 
    });
  });

  // delete course
  router.delete('/:id', verifyToken, function(req,res,next){
    if (req.role != "student") return res.status(401).send({ message: "You are not a student."});
    User.findByIdAndUpdate(req.userId, {$pull: {courses: req.params.id}}, {new: true}, function(err, user){
        console.log(err);
        if (err) return res.status(500).send({ message: "There was a problem deleting the course from the user."});
        if (!user) return res.status(404).send({ messsage: "User " + req.userId + " not found."});
        var student_to_remove = "course_gradebook." + String(user._id);
        Course.findByIdAndUpdate(req.params.id, {$unset: {[student_to_remove]: "" }}, {new: true}, function(err, course){
            if (err) return res.status(500).send({ message: "There was a problem deleting the user from the course."});
            if (!course) return res.status(404).send({ message: "Course with join code " + req.params.join_code + " not found."});
            res.status(200).send(course)
        });
    });
  });

module.exports = router;