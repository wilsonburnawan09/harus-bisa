var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
router.use(bodyParser.urlencoded({ extended: true }));
var bcrypt = require('bcryptjs');
router.use(bodyParser.json());
var User = require('../model/User');
var verifyToken = require('./auth/verifyTokenMiddleware');

// get a user by id
router.get('/:user_id', verifyToken, function(req, res, next) {
    if (req.userId != req.params.user_id) {
        // res.status(401).send({ message: "ID does not match with ID in token.", data: null});
        res.status(401).send({ message: "ID pengguna tidak sama dengan ID di dalam token.", data: null});
    } else {
        User.findById(req.params.user_id, {password: 0, courses: 0}, function (err, user) {
            // if (err) return res.status(500).send({ message: "There was a problem finding the user.", data: null});
            if (err) return res.status(500).send({ message: "Terjadi masalah dalam mencari pengguna aplikasi.", data: null});
            // if (!user) return res.status(404).send({ message: "User " + req.params.id + " not found.", data: null});
            if (!user) return res.status(404).send({ message: "Pengguna " + req.params.id + " tidak ditemukan.", data: null});
            // res.status(200).send({ message: "Get user is a success.", data:user });
            res.status(200).send({ message: "Mencari pengguna aplikasi telah berhasil.", data:user });
        });
    }
});

// delete a user by id
router.delete('/:user_id', verifyToken, function (req, res, next) {
    if (req.userId != req.params.user_id) {
        // res.status(401).send({ message: "ID does not match with ID in token.", data: null});
        res.status(401).send({ message: "ID pengguna tidak sama dengan ID di dalam token.", data: null});
    } else {
        User.findByIdAndDelete(req.params.user_id, {projection: {courses: 0, password: 0}}, function (err, user) {
            // if (err) return res.status(500).send({ message: "There was a problem deleting the user.", data: null});
            if (err) return res.status(500).send({ message: "Terjadi masalah dalam menghapus pengguna aplikasi.", data: null});
            // if (!user) return res.status(404).send({ message: "User " + req.params.user_id + " not found.", data: null});
            if (!user) return res.status(404).send({ message: "Pengguna " + req.params.id + " tidak ditemukan.", data: null});
            // res.status(200).send({message: "User: " + req.params.user_id + " was deleted.", data: user});
            res.status(200).send({message: "Pengguna: " + req.params.user_id + " telah dihapus.", data: user});
        });
    }
});

// update a user by id
router.put('/:user_id', verifyToken, async function (req, res, next) {
    if (req.userId != req.params.user_id) {
        // res.status(401).send({ message: "ID does not match ID in token."});
        res.status(401).send({ message: "ID pengguna tidak sama dengan ID di dalam token.", data: null});
    } else {
        user = {};
        if (req.body.first_name != null) {
            user["first_name"] = req.body.first_name.trim();
        }
        if (req.body.last_name != null) {
            user["last_name"] = req.body.last_name.trim();
        }
        if (req.body.school != null) {
            user["school"] = req.body.school.trim();
        }
        // if (req.body.role != null) {
        //     if (req.body.role != "faculty" && req.body.role != "student") {
        //         return res.status(500).send({ message: "Role must be 'faculty' or 'student'", data: null});
        //     } else {
        //         user["role"] = req.body.role.trim();
        //     }            
        // }

        if (req.body.new_password != null) {
            if (req.body.old_password == null) {
                // return res.status(500).send({ message: "Please provide old password", data: null});
                return res.status(500).send({ message: "Mohon memberi kata sandi lama.", data: null});
            } else {
                var target_user = User.findById(req.params.user_id);
                var old_password_match = await target_user.then((user) => {
                    var passwordIsValid = bcrypt.compareSync(req.body.old_password, user.password);
                    if (passwordIsValid) {
                        return true;
                    } else {
                        return false;
                    }
                });
                if(!old_password_match) {
                    // return res.status(403).send({ message: "Old password does not match.", data: null});
                    return res.status(403).send({ message: "Kata sandi tidak sama.", data: null});
                } else {
                    user["password"] = bcrypt.hashSync(req.body.new_password, 8);
                }
            }
        }

        User.findByIdAndUpdate(req.params.user_id, {$set: user}, {new: true, projection: {password: 0, courses: 0}}, function (err, user) {
            // if (err) return res.status(500).send({ message: "There was an error updating the user.", data: null});
            if (err) return res.status(500).send({ message: "Terjadi masalah dalam mengganti data pengguna aplikasi.", data: null});
            // if (!user) return res.status(404).send({ message: "User " + req.params.user_id + " not found.", data: null});
            if (!user) return res.status(404).send({ message: "Pengguna " + req.params.user_id + " tidak ditemukan.", data: null});
            // res.status(200).send({ message: "User has been updated.", data: user});
            res.status(200).send({ message: "Data pengguna aplikasi telah diganti.", data: user});
            
        });
    }
});

module.exports = router;