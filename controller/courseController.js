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
        var start_term = "";
        var end_term = "";
        var description = "";
        var user = {};
        user[req.userId] = {
            role: req.role,
            overall: "N/A",
            lecture_grades: {}
        }
        if (!req.body.course_name) {
            return res.status(500).send({ message: "Please provide course name.", data: null});
        } else { 
            course_name = req.body.course_name.trim();
        }

        if (req.body.start_term != null) {
            start_term = req.body.start_term.trim();
        } 

        if (req.body.end_term != null) {
            end_term = req.body.end_term.trim();
        } 

        if (req.body.description != null) { 
            description = req.body.description.trim();
        } 

        Counter.findByIdAndUpdate("join_code", {$inc: {value: 1}}, {new: true}).then(function(counter){
            Course.create({
                course_name: course_name,
                join_code: counter.value,
                start_term: start_term,
                end_term: end_term,
                description: description,
                number_of_students: 0,
                number_of_lectures: 0,
                instructor: req.first_name + ' ' + req.last_name,
                instructor_id: req.userId,
                course_gradebook: user
            }, function(err, course){
                if (err) return res.status(500).send({ message: "There was a problem creating the course.", data: null});
                User.findByIdAndUpdate(req.userId, { $addToSet: { courses: course._id}}, {new: true, projection: {course_gradebook: 0, lectures: 0}}, function(err,user){
                    if (err) return res.status(500).send({ mesesage: "There was a problem adding the course to the user.", data: null});
                    if (!user) return res.status(500).send({ message: "There was a problem finding the user.", data: null});
                    Promise.all(user.courses.map(async (course_id) => {
                        return await Course.findById(course_id, {course_gradebook: 0, lectures: 0});
                    }))
                    .then(courses => {
                        user_with_courses = {
                            _id: user._id,
                            first_name: user.first_name,
                            last_name: user.last_name,
                            email: user.email,
                            role: user.role,
                            school: user.school,
                            courses : courses
                        }
                        res.status(200).send({  message: "Course has been added.",
                                                data: user_with_courses
                                            });
                    })
                    .catch(err => {
                        res.status(500).send({  message: "There was a problem getting the courses.",
                                                data: null
                                            });
                    }) 
                });
            });
        })
        .catch(function (err){
            res.status(500).send({ message: "There was a problem generating the join code.", data: null});
        });
    } else if (req.role == "student") {
        var join_code;
        if(req.body.join_code) {join_code = req.body.join_code.trim();}
        Course.findOne({join_code: join_code}, function(err, course){
            if (err) return res.status(500).send({ message: "There was a problem finding the course.", data: null});
            if (!course) return res.status(404).send({ message: "Course not found.", data: null});
            if (course.course_gradebook.has(String(req.userId))) return res.status(409).send({ message: "Student is already in the course gradebook.", data: null});
            User.findOne({_id: req.userId}, function(err, user){
                if (err) return res.status(500).send({ message: "There was a problem finding the student.", data: null});
                if (!user) return res.status(404).send({ message: "User not found.", data: null});
                var course_added = false;
                for (var i = 0; i < user.courses.length; i++){
                    if(String(user.courses[i]) == String(course._id)) {
                        course_added = true;
                        break;
                    }
                }
                if (!course_added){
                    user.courses.push(course._id);
    
                    user.save()
                    .then(function(){
                        var student_gradebook = {
                            role: "student",
                            overall: "NA",
                            lectures_grades: {}
                        }
                        var new_student = "course_gradebook." + String(user._id);
                        Course.findByIdAndUpdate(course._id, {$set: {[new_student]: student_gradebook}, $inc: {number_of_students: 1}}, {new: true}, function(err, course){
                            if (err) return res.status(500).send({ message: "There was a problem adding the user to the course.", data: null});
                            Promise.all(user.courses.map(async (course_id) => {
                                return await Course.findById(course_id, {course_gradebook: 0, lectures: 0});
                            }))
                            .then(courses => {
                                user_with_courses = {
                                    _id: user._id,
                                    first_name: user.first_name,
                                    last_name: user.last_name,
                                    email: user.email,
                                    role: user.role,
                                    school: user.school,
                                    courses : courses
                                }
                                res.status(200).send({  message: "Course has been added to student.",
                                                        data: user_with_courses
                                                    });
                            })
                            .catch(err => {
                                res.status(500).send({  message: "There was a problem getting the courses.",
                                                        data: null
                                                    });
                            }); 
                        });
                    })
                    .catch(err => {
                        res.status(500).send({  message: "There was a problem adding the course to the user.",
                                                data: null
                                            });
                    }); 
                } else {
                    res.status(409).send({ message: "Course is already in the student course list.", data: null});
                }
            })
        });
    } 
});

// get courses
router.get('/', verifyToken, function(req, res, next){ 
    User.findById(req.userId, function(err, user){
        if(err) return res.status(500).send({ message: "There was a problem getting the user information.", data: null});
        if(!user) return res.status(404).send({ message: "User " + req.userId + " not found.", data: null});
        Promise.all(user.courses.map(async (course_id) => {
            return await Course.findById(course_id, {course_gradebook: 0, lectures: 0});
        }))
        .then(courses => {
            user_with_courses = {
                _id: user._id,
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email,
                role: user.role,
                school: user.school,
                courses : courses,
            }
            res.status(200).send({  message: "Get course is a success.",
                                    data: user_with_courses
                                });
        })
        .catch(err => {
            res.status(500).send({  message: "There was a problem getting the courses.",
                                    data: null});
        }) 
    });
});

// get course by join_code
router.get('/:join_code', verifyToken, function(req, res, next){
    Course.findOne({join_code: req.params.join_code}, {course_gradebook: 0, lectures: 0}, function(err, course){
        if (err) return res.status(500).send({ message: "There was a problem looking for the course."});
        if (!course) return res.status(404).send({ message: "Course " + req.params.id + " not found."});
        res.status(200).send({  message: "Get course is a success.", data: course});
    })
});

// update course by id
router.put('/:id', verifyToken, function(req, res, next){
    if (req.role != "professor") return res.status(401).send({ message: "Only professor allowed to update course."})
    Course.findById(req.params.id, function(err, course){
        if (err) return res.status(500).send({ message: "There was a problem looking for the course."});
        if (!course) return res.status(404).send({ message: "Course " + req.params.id + " not found."});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "The ID provided does not match the instructor ID for the course."});

        if (req.body.course_name != null) { course.course_name = req.body.course_name.trim(); }
        if (req.body.start_term != null) { course.start_term = req.body.start_term.trim(); }
        if (req.body.end_term != null) { course.end_term = req.body.end_term.trim(); }
        if (req.body.description != null) { course.description = req.body.description.trim(); }
        if (req.body.instructor != null) { course.instructor = req.body.instructor.trim(); } 

        course.save().then(function(){
            User.findById(req.userId, function(err, user){
                if(err) return res.status(500).send({ message: "There was a problem getting the user information.", data: null});
                if(!user) return res.status(404).send({ message: "User " + req.userId + " not found.", data: null});
                Promise.all(user.courses.map(async (course_id) => {
                    return await Course.findById(course_id, {course_gradebook: 0, lectures: 0});
                }))
                .then(courses => {
                    user_with_courses = {
                        _id: user._id,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        email: user.email,
                        role: user.role,
                        school: user.school,
                        courses : courses
                    }
                    res.status(200).send({  message: "Update course is a success.",
                                            data: user_with_courses
                                        });
                })
                .catch(err => {
                    res.status(500).send({  message: "There was a problem getting the courses.",
                                            data: null});
                }); 
            });
        })
        .catch(err => {
            res.status(500).send({  message: "There was a problem getting the courses.",
                                    data: null
                                });
        }); 
    });
});

// delete course by id
router.delete('/:id', verifyToken, function(req, res, next){
    if (req.role == "professor") {
        Course.findById(req.params.id, function(err, course){
            if (err) return res.status(500).send({ message: "There was a problem looking for the course.", data: null});
            if (!course) return res.status(404).send({ message: "Course not found.", data: null});
            if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the professor of this course.", data: null});
            Course.findByIdAndDelete(req.params.id, function(err, course){
                if (err) return res.status(500).send({ message: "There was a problem deleting the course.", data: null});
                let users = [...course.course_gradebook.keys()]
                Promise.all(users.map(async (user_id) => {
                    let user_promise = "";
                    return await User.findByIdAndUpdate(user_id, {$pull: {courses: req.params.id}}, {new: true}, function(err, user){
                        if (err) { console.log("There was a problem deleting the course from the user " + user_id + "."); }
                        if (!user) { console.log("User " + user_id + " not found."); }
                        user_promise = user;
                        return user;
                    });
                }))
                .then( (users) => {
                    User.findById(req.userId, function(err, user){
                        if(err) return res.status(500).send({ message: "There was a problem getting the user information.", data: null});
                        if(!user) return res.status(404).send({ message: "User " + req.userId + " not found.", data: null });
                        Promise.all(user.courses.map(async (course_id) => {
                            return await Course.findById(course_id, {course_gradebook: 0, lectures: 0});
                        }))
                        .then(courses => {
                            user_with_courses = {
                                _id: user._id,
                                first_name: user.first_name,
                                last_name: user.last_name,
                                email: user.email,
                                role: user.role,
                                school: user.school,
                                courses : courses
                            }
                            res.status(200).send({  message: "Course has been deleted.",
                                                    data: user_with_courses
                                                });
                        })
                        .catch(err => {
                            res.status(500).send({  message: "There was a problem getting the courses.",
                                                    data: null
                                                });
                        }) 
                    });
                })
                .catch( err => {
                    res.status(500).send({  message: "There was a problem deleting the course from the users",
                                            data: null
                                        });
                })
            });
        });
    } else if (req.role == "student") {
        User.findByIdAndUpdate(req.userId, {$pull: {courses: req.params.id}}, {new: true, projection: {course_gradebook: 0, lectures: 0}}, function(err, user){
            if (err) return res.status(500).send({ message: "There was a problem deleting the course from the user.", data: null});
            if (!user) return res.status(404).send({ messsage: "User " + req.userId + " not found.", data: null});
            var student_to_remove = "course_gradebook." + String(user._id);
            Course.findByIdAndUpdate(req.params.id, {$unset: {[student_to_remove]: "" }, $inc: {number_of_students: -1}}, {new: true}, function(err, course){
                if (err) return res.status(500).send({ message: "There was a problem deleting the user from the course.", data: null});
                if (!course) return res.status(404).send({ message: "Course with join code " + req.params.join_code + " not found.", data: null});
                Promise.all(user.courses.map(async (course_id) => {
                    return await Course.findById(course_id, {course_gradebook: 0, lectures: 0});
                }))
                .then(courses => {
                    user_with_courses = {
                        _id: user._id,
                        first_name: user.first_name,
                        last_name: user.last_name,
                        email: user.email,
                        role: user.role,
                        school: user.school,
                        courses : courses
                    }
                    res.status(200).send({  message: "Course has been deleted.",
                                            data: user_with_courses
                                        });
                })
                .catch(err => {
                    res.status(500).send({  message: "There was a problem getting the courses.",
                                            data: null
                                        });
                }); 
            });
        });
    } 
});

module.exports = router;