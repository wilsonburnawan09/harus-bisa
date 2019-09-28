var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());
var User = require('../model/User');
var Course = require('../model/Course');
var Counter = require('../model/Counter');
var verifyToken = require('./auth/verifyTokenMiddleware');

var term_is_valid = (start, end) => {
    var start = start.split(" ");
    var start_month = month_converter(start[0]);
    var start_year = start[1];
    var end = end.split(" ");
    var end_month = month_converter(end[0]);
    var end_year = end[1];
    if (end_year < start_year) {
        return false;
    } else if (end_month < start_month) {
        return false;
    }
    return true;
};

var month_converter = (month) => {
    var month_int;
    switch(month) {
        case "January":
            month_int = 1;
            break;
        case "February":
            month_int = 2;
            break;
        case "March":
            month_int = 3;
            break;
        case "April":
            month_int = 4;
            break;
        case "May":
            month_int = 5;
            break;
        case "June":
            month_int = 6;
            break;
        case "July":
            month_int = 7;
            break;
        case "August":
            month_int = 8;
            break;
        case "September":
            month_int = 9;
            break;
        case "October":
            month_int = 10;
            break;
        case "November":
            month_int = 11;
            break;
        case "December":
            month_int = 12;
            break;
      }

      return month_int;
};

// create course (faculty) or add course (student)
router.post('/', verifyToken, function(req, res, next){
    if (req.role == "faculty") {
        var course_name = "";
        var start_term = "";
        var end_term = "";
        var description = "";
        var user = {};
        user[req.userId] = {
            role: req.role,
            overall: "N/A",
            lectures_record: {}
        }
        if (!req.body.course_name) {
            // return res.status(500).send({ message: "Please provide course name.", data: null});
            return res.status(500).send({ message: "Mohon memberi nama kelas.", data: null});
        } else { 
            course_name = req.body.course_name.trim();
        }

        if (req.body.start_term != null) {
            start_term = req.body.start_term.trim();
        } 

        if (req.body.end_term != null) {
            end_term = req.body.end_term.trim();
        } 

        if (!term_is_valid(start_term, end_term)) {
            return res.status(500).send({ message: "Akhir kelas harus setelah mulai kelas.", data: null});
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
                // if (err) return res.status(500).send({ message: "There was a problem creating the course.", data: null});
                if (err) return res.status(500).send({ message: "Terjadi masalah dalam membuat kelas.", data: null});
                User.findByIdAndUpdate(req.userId, { $addToSet: { courses: course._id}}, {new: true, projection: {course_gradebook: 0, lectures: 0}}, function(err,user){
                    // if (err) return res.status(500).send({ mesesage: "There was a problem adding the course to the user.", data: null});
                    if (err) return res.status(500).send({ mesesage: "Terjadi masalah dalam menambah kelas ke professor.", data: null});
                    // if (!user) return res.status(500).send({ message: "There was a problem finding the user.", data: null});
                    if (!user) return res.status(500).send({ message: "Terjadi masalah dalam mencari professor.", data: null});
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
                        // res.status(200).send({  message: "Course has been added.",
                        //                         data: user_with_courses
                        //                     });
                        res.status(200).send({  message: "Kelas sudah ditambahkan.",
                                                data: user_with_courses
                                            });
                    })
                    .catch(err => {
                        // res.status(500).send({  message: "There was a problem getting the courses.",
                        //                         data: null
                        //                     });
                        res.status(500).send({  message: "Terjadi masalah dalam mendapat kelas.",
                                                data: null
                                            });                   
                    }) 
                });
            });
        })
        .catch(function (err){
            // res.status(500).send({ message: "There was a problem generating the join code.", data: null});
            res.status(500).send({ message: "Terjadi masalah dalam menghasilkan kode gabung.", data: null});
        });
    } else if (req.role == "student") {
        var join_code;
        if(req.body.join_code) {join_code = req.body.join_code.trim();}
        Course.findOne({join_code: join_code}, function(err, course){
            // if (err) return res.status(500).send({ message: "There was a problem finding the course.", data: null});
            if (err) return res.status(500).send({ message: "Terjadi masalah dalam mencari kelas.", data: null});
            // if (!course) return res.status(404).send({ message: "Course not found.", data: null});
            if (!course) return res.status(404).send({ message: "Kelas tidak dapat ditemukan.", data: null});
            // if (course.course_gradebook.has(String(req.userId))) return res.status(409).send({ message: "Student is already in the course gradebook.", data: null});
            if (course.course_gradebook.has(String(req.userId))) return res.status(409).send({ message: "Murid sudah pernah terdaftar sebelumnya.", data: null});
            User.findOne({_id: req.userId}, function(err, user){
                // if (err) return res.status(500).send({ message: "There was a problem finding the student.", data: null});
                if (err) return res.status(500).send({ message: "Terjadi masalah dalam mencari murid.", data: null});
                // if (!user) return res.status(404).send({ message: "User not found.", data: null});
                if (!user) return res.status(404).send({ message: "Murid tidak dapat ditemukan.", data: null});
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
                            lectures_record: {}
                        }
                        course.lectures.forEach(lecture => {
                            if (lecture.has_lived) {
                                student_gradebook.lectures_record[lecture.id] = {
                                    present: false,
                                    quiz_answers: {}
                                }
                            }
                        })
                        var new_student = "course_gradebook." + String(user._id);
                        Course.findByIdAndUpdate(course._id, {$set: {[new_student]: student_gradebook}, $inc: {number_of_students: 1}}, {new: true}, function(err, course){
                            // if (err) return res.status(500).send({ message: "There was a problem adding the user to the course.", data: null});
                            if (err) return res.status(500).send({ message: "Terjadi masalah dalam menambah murid ke dalam kelas.", data: null});
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
                                // res.status(200).send({  message: "Course has been added to student.",
                                //                         data: user_with_courses
                                //                     });
                                res.status(200).send({  message: "Kelas telah ditambahkan ke murid.",
                                                        data: user_with_courses
                                                    });
                            })
                            .catch(err => {
                                // res.status(500).send({  message: "There was a problem getting the courses.",
                                //                         data: null
                                //                     });
                                res.status(500).send({  message: "Terjadi masalah dalam mendapatkan kelas.",
                                                        data: null
                                                    });
                            }); 
                        });
                    })
                    .catch(err => {
                        // res.status(500).send({  message: "There was a problem adding the course to the user.",
                        //                         data: null
                        //                     });
                        res.status(500).send({  message: "Terjadi masalah dalam menambhkan kelas ke murid.",
                            data: null
                        });
                    }); 
                } else {
                    // res.status(409).send({ message: "Course is already in the student course list.", data: null});
                    res.status(409).send({ message: "Kelas sudah pernah ditambahkan ke murid sebelumnya.", data: null});
                }
            })
        });
    } 
});

// get courses
router.get('/', verifyToken, function(req, res, next){ 
    User.findById(req.userId, function(err, user){
        // if(err) return res.status(500).send({ message: "There was a problem getting the user information.", data: null});
        if(err) return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan informasi pengguna aplikasi.", data: null});
        // if(!user) return res.status(404).send({ message: "User " + req.userId + " not found.", data: null});
        if(!user) return res.status(404).send({ message: "Pengguna " + req.userId + " tidak ditemukan.", data: null});
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
            // res.status(200).send({  message: "Get course is a success.",
            //                         data: user_with_courses
            //                     });
            res.status(200).send({  message: "Kelas telah berhasil didapatkan.",
                                    data: user_with_courses
                                });
        })
        .catch(err => {
            // res.status(500).send({  message: "There was a problem getting the courses.",
            //                         data: null});
            res.status(500).send({  message: "Terjadi masalah dalam mendapatkan kelas.",
                                    data: null});
        }) 
    });
});

// get course by join_code
router.get('/:join_code', verifyToken, function(req, res, next){
    Course.findOne({join_code: req.params.join_code}, {course_gradebook: 0, lectures: 0}, function(err, course){
        // if (err) return res.status(500).send({ message: "There was a problem looking for the course."});
        if (err) return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan kelas."});
        // if (!course) return res.status(404).send({ message: "Course " + req.params.join_code + " not found."});
        if (!course) return res.status(404).send({ message: "Kelas " + req.params.join_code + " tidak ditemukan."});
        // res.status(200).send({  message: "Get course is a success.", data: course});
        res.status(200).send({  message: "Kelas telah berhasil didapatkan.", data: course});
    })
});

// update course by id
router.put('/:id', verifyToken, function(req, res, next){
    // if (req.role != "faculty") return res.status(401).send({ message: "Only faculty allowed to update course."});
    if (req.role != "faculty") return res.status(401).send({ message: "Hanya fakultas yang mempunyai akses untuk mengganti kelas."});
    Course.findById(req.params.id, function(err, course){
        // if (err) return res.status(500).send({ message: "There was a problem looking for the course."});
        if (err) return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan kelas."});
        // if (!course) return res.status(404).send({ message: "Course " + req.params.id + " not found."});
        if (!course) return res.status(404).send({ message: "Kelas " + req.params.id + " tidak ditemukan."});
        // if (course.instructor_id != req.userId) return res.status(401).send({ message: "The ID provided does not match the instructor ID for the course."});
        if (course.instructor_id != req.userId) return res.status(401).send({ message: "ID pengguna aplikasi tidak sama dengan ID professor untuk kelas ini."});

        if (req.body.course_name != null) { course.course_name = req.body.course_name.trim(); }
        if (req.body.start_term != null) { course.start_term = req.body.start_term.trim(); }
        if (req.body.end_term != null) { course.end_term = req.body.end_term.trim(); }
        if (!term_is_valid(req.body.start_term.trim(), req.body.end_term.trim())) {
            return res.status(500).send({ message: "Akhir kelas harus setelah mulai kelas.", data: null});
        }
        if (req.body.description != null) { course.description = req.body.description.trim(); }
        if (req.body.instructor != null) { course.instructor = req.body.instructor.trim(); } 

        course.save().then(function(){
            User.findById(req.userId, function(err, user){
                // if(err) return res.status(500).send({ message: "There was a problem getting the user information.", data: null});
                if(err) return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan informasi professor.", data: null});
                // if(!user) return res.status(404).send({ message: "User " + req.userId + " not found.", data: null});
                if(!user) return res.status(404).send({ message: "Professor " + req.userId + " tidak ditemukan.", data: null});
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
                    // res.status(200).send({  message: "Update course is a success.",
                    //                         data: user_with_courses
                    //                     });
                    res.status(200).send({  message: "Informasi kelas telah berhasil diganti.",
                                            data: user_with_courses
                                        });
                })
                .catch(err => {
                    // res.status(500).send({  message: "There was a problem getting the courses.",
                    //                         data: null});
                    res.status(500).send({  message: "Terjadi masalah dalam mendapatkan kelas-kelas .",
                                            data: null});
                }); 
            });
        })
        .catch(err => {
            // res.status(500).send({  message: "There was a problem getting the courses.",
            //                         data: null
            //                     });
            res.status(500).send({  message: "Terjadi masalah dalam mendapatkan kelas-kelas.",
                                    data: null
                                });
        }); 
    });
});

// delete course by id
router.delete('/:id', verifyToken, function(req, res, next){
    if (req.role == "faculty") {
        Course.findById(req.params.id, function(err, course){
            // if (err) return res.status(500).send({ message: "There was a problem looking for the course.", data: null});
            if (err) return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan kelas.", data: null});
            // if (!course) return res.status(404).send({ message: "Course not found.", data: null});
            if (!course) return res.status(404).send({ message: "Kelas tidak dapat ditemukan.", data: null});
            // if (course.instructor_id != req.userId) return res.status(401).send({ message: "You are not the faculty of this course.", data: null});
            if (course.instructor_id != req.userId) return res.status(401).send({ message: "ID pengguna aplikasi tidak sama dengan ID professor untuk kelas ini.", data: null});
            Course.findByIdAndDelete(req.params.id, function(err, course){
                // if (err) return res.status(500).send({ message: "There was a problem deleting the course.", data: null});
                if (err) return res.status(500).send({ message: "Terjadi masalah dalam menghapus kelas.", data: null});
                let users = [...course.course_gradebook.keys()]
                Promise.all(users.map(async (user_id) => {
                    let user_promise = "";
                    return await User.findByIdAndUpdate(user_id, {$pull: {courses: req.params.id}}, {new: true}, function(err, user){
                        // if (err) { console.log("There was a problem deleting the course from the user " + user_id + "."); }
                        if (err) { console.log("Terjadi masalah dalam menghapus kelas dari pengguna aplikasi " + user_id + "."); }
                        // if (!user) { console.log("User " + user_id + " not found."); }
                        if (!user) { console.log("Pengguna aplikasi " + user_id + " tidak ditemukan."); }
                        user_promise = user;
                        return user;
                    });
                }))
                .then( (users) => {
                    User.findById(req.userId, function(err, user){
                        // if(err) return res.status(500).send({ message: "There was a problem getting the user information.", data: null});
                        if(err) return res.status(500).send({ message: "Terjadi masalah dalam mendapatkan informasi pengguna aplikasi.", data: null});
                        // if(!user) return res.status(404).send({ message: "User " + req.userId + " not found.", data: null });
                        if(!user) return res.status(404).send({ message: "Pengguna aplikasi " + req.userId + " tidak ditemukan.", data: null });
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
                            // res.status(200).send({  message: "Course has been deleted.",
                            //                         data: user_with_courses
                            //                     });
                            res.status(200).send({  message: "Kelas telah berhasil dihapus.",
                                                    data: user_with_courses
                                                });
                        })
                        .catch(err => {
                            // res.status(500).send({  message: "There was a problem getting the courses.",
                            //                         data: null
                            //                     });
                            res.status(500).send({  message: "Terjadi masalah dalam mendapatkan kelas-kelas.",
                                                    data: null
                                                });
                        }) 
                    });
                })
                .catch( err => {
                    // res.status(500).send({  message: "There was a problem deleting the course from the users",
                    //                         data: null
                    //                     });
                    res.status(500).send({  message: "Terjadi masalah dalam menghapus kelas dari pengguna-pengguna aplikasi",
                                            data: null
                                        });
                })
            });
        });
    } else if (req.role == "student") {
        User.findByIdAndUpdate(req.userId, {$pull: {courses: req.params.id}}, {new: true, projection: {course_gradebook: 0, lectures: 0}}, function(err, user){
            // if (err) return res.status(500).send({ message: "There was a problem deleting the course from the user.", data: null});
            if (err) return res.status(500).send({ message: "Terjadi masalah dalam menghapus kelas dari murid.", data: null});
            // if (!user) return res.status(404).send({ messsage: "User " + req.userId + " not found.", data: null});
            if (!user) return res.status(404).send({ messsage: "Murid " + req.userId + " tidak ditemukan.", data: null});
            var student_to_remove = "course_gradebook." + String(user._id);
            Course.findByIdAndUpdate(req.params.id, {$unset: {[student_to_remove]: "" }, $inc: {number_of_students: -1}}, {new: true}, function(err, course){
                // if (err) return res.status(500).send({ message: "There was a problem deleting the user from the course.", data: null});
                if (err) return res.status(500).send({ message: "Terjadi masalah dalam menghapus murid dari kelas.", data: null});
                // if (!course) return res.status(404).send({ message: "Course with join code " + req.params.join_code + " not found.", data: null});
                if (!course) return res.status(404).send({ message: "Kelas dengan kode gabung " + req.params.join_code + " tidak ditemukan.", data: null});
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
                    // res.status(200).send({  message: "Course has been deleted.",
                    //                         data: user_with_courses
                    //                     });
                    res.status(200).send({  message: "Murid telah berhasil dihapus dari kelas.",
                                            data: user_with_courses
                                        });
                })
                .catch(err => {
                    // res.status(500).send({  message: "There was a problem getting the courses.",
                    //                         data: null
                    //                     });
                    res.status(500).send({  message: "Terjadi masalah dalam mendapatkan kelas-kelas.",
                                            data: null
                                        });
                });
            });
        });
    } 
});

module.exports = router;