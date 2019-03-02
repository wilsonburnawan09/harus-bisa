var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());
var User = require('../model/User');
var Course = require('../model/Course');
var Counter = require('../model/Counter');
var verifyToken = require('./auth/verifyTokenMiddleware');

// create course (professor) or add course (student)
router.post('/', verifyToken, function(req, res, next){
    if (req.role == "professor") {
        var course_name = "";
        var term = "";
        var description = "";
        var user = {}
        user[req.userId] = {
            role: req.role,
            overall: "N/A",
            lecture_grades: []
        }
        if (!req.body.course_name) {
            return res.status(500).send({ message: "Please provide course name."});
        } else { 
            course_name = req.body.course_name.trim();
        }
        if (req.body.start_term && req.body.end_term) { term = req.body.start_term.trim() + " - " + req.body.end_term.trim();}
        if (req.body.description) { description = req.body.description.trim();}
        Counter.findByIdAndUpdate("join_code", {$inc: {value: 1}}, {new: true}).then(function(counter){
            Course.create({
                course_name: course_name,
                join_code: counter.value,
                term: term,
                description: description,
                instructor: req.first_name + ' ' + req.last_name,
                instructor_id: req.userId,
                course_gradebook: user
            }, function(err, course){
                if (err) return res.status(500).send({ message: "There was a problem creating the course."});
                User.findByIdAndUpdate(req.userId, { $addToSet: { courses: course._id}}, {new: true}, function(err,user){
                    if (err) return res.status(500).send({ mesesage: "There was a problem adding the course to the user."});
                    if (!user) return res.status(500).send({ message: "There was a problem finding the user."});
                    res.status(200).send({ message: "Course has been created."});
                });
            });
        })
        .catch(function (err){
            res.status(500).send({ message: "There was a problem generating the join code."});
        });
    } else if (req.role == "student") {
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
                            res.status(201).send({ message: "Course has been added."});
                        });
                    });
                } else {
                    res.status(409).send({ message: "Course is already in the student course list."});
                }
            })
        });
    } 
});

// get courses
router.get('/', verifyToken, function(req, res, next){ 
    User.findById(req.userId, async function(err, user){
        if(err) return res.status(500).send({ message: "There was a problem getting the user information."});
        if(!user) return res.status(404).send({ message: "User " + req.userId + " not found." });
        Promise.all(user.courses.map(async (course_id) => {
            var course_promise;
            await Course.findById(course_id, function(err, course){
                var course = course.toObject();
                delete course.course_gradebook;
                delete course.lectures;
                delete course.instructor_id;
                course_promise = course;
            })
            return course_promise;
        }))
        .then(courses => {
            user_with_courses = {
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                school: user.school,
                courses : courses
            }
            res.status(200).send(user_with_courses);
        })
        .catch(err => {
            res.status(500).send({ message: "There was a problem getting the courses."});
        }) 
    });
});

// update course by id
router.put('/:id', verifyToken, function(req, res, next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professor allowed to update course."})
    Course.findById(req.params.id, function(err, course){
        if (err) return res.status(500).send({ message: "There was a problem looking for the course."});
        if (!course) return res.status(404).send({ message: "Course " + req.params.id + " not found."});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "The ID provided does not match the instructor ID for the course."});

        if (req.body.course_name) { course.course_name = req.body.course_name.trim(); }
        if (req.body.start_term) { 
            splitted_term = course.term.split(" ");
            course.term = req.body.start_term.trim() + " - " + splitted_term[2]; 
        }
        if (req.body.end_term) { 
            splitted_term = course.term.split(" ");
            course.term = splitted_term[0] + " - " + req.body.end_term.trim(); 
        }
        if (req.body.description) { course.description = req.body.description.trim(); }
        if (req.body.school) { course.school = req.body.school.trim(); }
        if (req.body.instructor) { course.instructor = req.body.instructor.trim(); } 

        course.save();
        res.status(200).send(course);
    });
});

// delete course by id
router.delete('/:id', verifyToken, function(req, res, next){
    if (req.role == "professor") {
        Course.findByIdAndDelete(req.params.id, function(err, course){
            if (err) return res.status(500).send({ message: "There was a problem deleting the course."});
            if (!course) return res.status(404).send({ message: "Course not found."});
            if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course."});
            let users = [...course.course_gradebook.keys()]
            Promise.all(users.map(async (user_id) => {
                let user_promise = "";
                await User.findByIdAndUpdate(user_id, {$pull: {courses: req.params.id}}, {new: true}, function(err, user){
                    if (err) { console.log("There was a problem deleting the course from the user " + user_id + "."); }
                    if (!user) { console.log("User " + user_id + " not found."); }
                    user_promise = user;
                });
                return user_promise;
            }))
            .then( (users) => {
                res.status(200).send({ message: "Course has been deleted."});
            })
            .catch( err => {
                console.log(err);
                res.status(500).send({ message: "There was a problem deleting the course from the users"});
            })
        });
    } else if (req.role == "student") {
        User.findByIdAndUpdate(req.userId, {$pull: {courses: req.params.id}}, {new: true}, function(err, user){
            if (err) return res.status(500).send({ message: "There was a problem deleting the course from the user."});
            if (!user) return res.status(404).send({ messsage: "User " + req.userId + " not found."});
            var student_to_remove = "course_gradebook." + String(user._id);
            Course.findByIdAndUpdate(req.params.id, {$unset: {[student_to_remove]: "" }}, {new: true}, function(err, course){
                if (err) return res.status(500).send({ message: "There was a problem deleting the user from the course."});
                if (!course) return res.status(404).send({ message: "Course with join code " + req.params.join_code + " not found."});
                res.status(200).send({ message: "Course has been removed from student."});
            });
        });
    }
    
});


module.exports = router;