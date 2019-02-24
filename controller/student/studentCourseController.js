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
    Course.findOne({join_code: req.body.join_code}, function(err, course){
        if(err) return res.status(500).send({ message: "There was a problem finding the course."});
        if(!course) return res.status(404).send({ message: "Course not found."});

        User.findOne({_id: req.userId}, function(err, user){
            if(err) return res.status(500).send({ message: "There was a problem finding the student."});
            if(!user) return res.status(404).send({ message: "User not found."});
            var course_added = false;
            for (var i = 0; i < user.courses.length; i++){
                if(user.courses[i].join_code == course.join_code){
                    course_added = true;
                    break;
                }
            }
            if (!course_added){
                user.courses.push(course);
                user.save(function(err){
                    if(err) return res.status(500).send({user: user, message: "There was a problem addding the course"});
                    res.status(201).send({course: course, message: "Course added."});
                });
            }else{
                res.status(409).send({message:"Student is already in the course."});
            }
        })
    });
});

// get courses
router.get('/', verifyToken, function(req, res, next) {
    User.findById(req.userId, function (err, user) {
      if (err) return res.status(500).send({ message: "There was a problem finding the user."});
      if (!user) return res.status(404).send({ message: "No user found."});
      user = {
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        school: user.school,
        role: user.role,
        courses: user.courses
      }
      res.status(200).send(user);
    });
  });

  // delete course
  router.delete('/:join_code', verifyToken, function(req,res,next){
    User.findOneAndUpdate({ email: req.email}, {$pull: {courses: {join_code: req.params.join_code}}}, {new: true}, function(err, course){
        if(err) return res.status(500).send({message: "There was a problem deleting the course."});
        res.status(200).send({ deleted_course: course});
        // for(var i = 0; i < user.courses.length; i++){
        //     if(user.courses[i].join_code == req.params.join_code){
        //         removed_course = user.courses[i];
        //         user.courses.pull({join_code: req.params.join_code});
        //         User.update({ join_code: req.params.join_code}, { $pull: {followers: "foo_bar"
        //             }
        //         }).exec(function(err, user){
        //             console.log("foo_bar is removed from the list of your followers");
        //         })
        //         user.save(function(err, saved){
        //             if(err) return res.status(500).send({message: "There was a problem removing the course"});
        //             res.status(200).send({removed_course: saved, message: "Course has been removed."});
        //         });
        //         course_deleted = true;
        //         break;
        //     }
        // }
        // if(!course_deleted){
        //     res.status(404).send({not_found_course_join_code: req.params.join_code, message: "Course not found in the student's course list "});
        // }
    });
  });


module.exports = router;