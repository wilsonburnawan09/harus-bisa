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
    Course.create({
        course_code: req.body.course_code,
        couse_name: req.body.course_name,
        join_code: join_code,
        term: req.body.term,
        description: req.body.description,
        instructors: req.first_name + ' ' + req.last_name
    }, function(err, course){
        if (err) return res.status(500).send("There was a problem creating the course.");
        res.status(200).send({course: course});
    });
});

router.get('/', function(req,res){
    Course.find({}, function(err, courses){
        // if(err) res.status(500).send("Error getting course with join code " + req.query.join_code);
        if(err) res.status(500).send("Error getting courses");
        res.status(200).send({course: course});
    });
});

router.delete('/', function(req,res){
    Course.deleteMany({}, function(err){
        if (err) return res.status(500).send({message: 'Error deleting all courses'});
        res.status(200).send({message: "All courses deleted"})
    });
});


module.exports = router;