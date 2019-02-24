var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: true }));
var bcrypt = require('bcryptjs');
router.use(bodyParser.json());
var User = require('../../model/User');
var verifyToken = require('../auth/verifyTokenMiddleware');

// get a user by id
router.get('/:id', verifyToken, function(req, res, next) {
    if (req.userId != req.params.id) {
        res.status(401).send({ message: "ID does not match with ID in token."});
    } else {
        User.findById(req.params.id, function (err, user) {
            if (err) return res.status(500).send({ message: "There was a problem finding the user."});
            if (!user) return res.status(404).send({ message: "User " + req.params.id + " not found."});
            res.status(200).send(user);
        });
    }
});

// delete a user by id
router.delete('/:id', verifyToken, function (req, res, next) {
    if (req.userId != req.params.id) {
        res.status(401).send({ message: "ID does not match with ID in token."});
    } else {
        User.findByIdAndDelete(req.params.id, function (err, user) {
            if (err) return res.status(500).send({ message: "There was a problem deleting the user."});
            if (!user) return res.status(404).send({ message: "User " + req.params.id + " not found."})
            res.status(200).send({message: "User: " + req.params.id + " was deleted."});
        });
    }
});

// update a user by id
router.put('/:id', verifyToken, function (req, res, next) {
    if (req.userId != req.params.id) {
        res.status(401).send({ message: "ID does not match ID in token."});
    } else {
        var first_name = "";
        var last_name = "";
        var email = "";
        var school = "";
        var role = "";
        var hashed_password = "";
        if(req.body.first_name) {first_name = req.body.first_name.trim();}
        if(req.body.last_name) {last_name = req.body.last_name.trim();}
        if(!req.body.email){
            return res.status(500).send({ message: "Email not provided."});
        }else{
            email = req.body.email.trim();
        }
        if (req.body.school) {school = req.body.school.trim();}
        if (!req.body.role){
            return res.status(500).send({ message: "Role not provided"});
        }else{
            role = req.body.role.trim();
        }
        if (!req.body.password){
            return res.status(500).send({ message: "Password not provided."})
        }else{
            hashed_password = bcrypt.hashSync(req.body.password, 8);
        }
        user = {
            first_name: first_name,
            last_name: last_name,
            email: email,
            school: school,
            role: role,
            password: hashed_password
        }
        User.findOneAndUpdate({ _id: req.params.id}, {$set: user}, {new: true}, function (err, user) {
            if (err) return res.status(500).send({ message: "There was an error updating the user."});
            if (!user) return res.status(404).send({ message: "User " + req.params.id + " not found"});
            res.status(200).send(user);
        });
    }
});

module.exports = router;