var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: false }));
router.use(bodyParser.json());
var User = require('../../model/User');
var Course = require('../../model/Course');
var Counter = require('../../model/Counter');
var verifyToken = require('../auth/verifyTokenMiddleware');

// add course
router.post('/', verifyToken, function(req, res, next){
    if (req.role != "professor") return res.status(401).send({ message: "You are not a professor."});
    var course_code = "";
    var course_name = "";
    var term = "";
    var description = "";
    if (req.body.course_code) { course_code = req.body.course_code.trim();}
    if (!req.body.course_name) {
        return res.status(500).send({ message: "Please provide course name."});
    } else { 
        course_name = req.body.course_name.trim();
    }
    if (req.body.term) { term = req.body.term.trim();}
    if (req.body.description) { description = req.body.description.trim();}
    Counter.findByIdAndUpdate("join_code", {$inc: {value: 1}}, {new: true}).then(function(counter){
        Course.create({
            course_code: course_code,
            course_name: course_name,
            join_code: counter.value,
            term: term,
            description: description,
            instructor: req.first_name + ' ' + req.last_name
        }, function(err, course){
            if (err) return res.status(500).send({ message: "There was a problem creating the course."});
            User.findByIdAndUpdate(req.userId, { $addToSet: { courses: course._id}}, {new: true}, function(err,user){
                if (err) return res.status(500).send({ mesesage: "There was a problem adding the course to the user."});
                if (!user) return res.status(500).send({ message: "There was a problem finding the user."});
                res.status(200).send({course: course});
            });
        });
    })
    .catch(function (err){
        res.status(500).send({ message: "There was a problem generating the join code."});
    });
});

router.get('/', function(req,res){
    Course.find({}, function(err, courses){
        // if(err) res.status(500).send("Error getting course with join code " + req.query.join_code);
        if(err) res.status(500).send("Error getting courses");
        res.status(200).send(courses);
    });
});

router.delete('/', function(req,res){
    Course.deleteMany({}, function(err){
        if (err) return res.status(500).send({message: 'Error deleting all courses'});
        res.status(200).send({message: "All courses deleted"})
    });
});


module.exports = router;